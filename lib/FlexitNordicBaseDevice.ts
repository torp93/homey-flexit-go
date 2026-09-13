import Homey from 'homey';
import { createRuntimeLogger, RuntimeLogger } from './logging';
import {
  Registry,
  FlexitDevice,
  FILTER_CHANGE_INTERVAL_MONTHS_SETTING,
  FILTER_CHANGE_INTERVAL_HOURS_LEGACY_SETTING,
  FIREPLACE_DURATION_SETTING,
  HIGH_DURATION_SETTING,
  FREE_COOLING_ENABLED_SETTING,
  FREE_COOLING_TEMPERATURE_SETPOINT_SETTING,
  FREE_COOLING_OUTSIDE_TEMPERATURE_LIMIT_SETTING,
  FREE_COOLING_MIN_ON_TIME_SECONDS_SETTING,
  FAN_PROFILE_MODES,
  FAN_PROFILE_SETTING_KEYS,
  FanProfileMode,
  MIN_FILTER_CHANGE_INTERVAL_HOURS,
  MAX_FILTER_CHANGE_INTERVAL_HOURS,
  MIN_FILTER_CHANGE_INTERVAL_MONTHS,
  MAX_FILTER_CHANGE_INTERVAL_MONTHS,
  normalizeFanProfilePercent,
  filterIntervalMonthsToHours,
  filterIntervalHoursToMonths,
  TARGET_TEMPERATURE_HOME_SETTING,
  TARGET_TEMPERATURE_AWAY_SETTING,
  MIN_TARGET_TEMPERATURE_C,
  MAX_TARGET_TEMPERATURE_C,
  MIN_FREE_COOLING_TEMPERATURE_C,
  MAX_FREE_COOLING_TEMPERATURE_C,
  MIN_FREE_COOLING_MIN_ON_TIME_SECONDS,
  MAX_FREE_COOLING_MIN_ON_TIME_SECONDS,
  normalizeFireplaceDurationMinutes,
  normalizeHighDurationMinutes,
  normalizeTargetTemperature,
  normalizeFreeCoolingTemperature,
  normalizeFreeCoolingMinOnTimeSeconds,
  FREE_COOLING_DT_START_SETTING,
  FREE_COOLING_DT_STOP_SETTING,
  MIN_FREE_COOLING_DT_K,
  MAX_FREE_COOLING_DT_K,
  normalizeFreeCoolingDt,
  DEICING_ENABLED_SETTING,
  DEICING_ROTOR_SPEED_SETTING,
  DEICING_SUPPLY_FAN_SETTING,
  DEICING_EXHAUST_FAN_SETTING,
  MIN_DEICING_PERCENT,
  MAX_DEICING_PERCENT,
  normalizeDeicingPercent,
} from './UnitRegistry';
import { migrateCapabilities } from './capabilityMigration';
import {
  HEATING_COIL_ENABLED_SETTING,
  UNIT_NUMERIC_SETTINGS,
  UNIT_SETTING_ORDER_RULES,
  findUnitNumericSetting,
  normalizeUnitNumericSetting,
} from './unitSettings';

const RESET_FILTER_CAPABILITY = 'button.reset_filter';
const REGISTRY_SETTING_SUPPRESSION_WINDOW_MS = 30_000;
const SETTING_SYNC_TOLERANCE = 0.1;
const FREE_COOLING_SETTING_KEYS = [
  FREE_COOLING_ENABLED_SETTING,
  FREE_COOLING_TEMPERATURE_SETPOINT_SETTING,
  FREE_COOLING_OUTSIDE_TEMPERATURE_LIMIT_SETTING,
  FREE_COOLING_MIN_ON_TIME_SECONDS_SETTING,
  FREE_COOLING_DT_START_SETTING,
  FREE_COOLING_DT_STOP_SETTING,
];
const DEICING_SETTING_KEYS = [
  DEICING_ENABLED_SETTING,
  DEICING_ROTOR_SPEED_SETTING,
  DEICING_SUPPLY_FAN_SETTING,
  DEICING_EXHAUST_FAN_SETTING,
];
const UNIT_SETTING_KEYS = [
  HEATING_COIL_ENABLED_SETTING,
  ...UNIT_NUMERIC_SETTINGS.map((setting) => setting.settingKey),
];
const FREE_COOLING_DT_START_LABEL = 'free cooling start temperature difference';
const FREE_COOLING_DT_STOP_LABEL = 'free cooling stop temperature difference';

function validateFreeCoolingDt(requestedValue: number, label: string) {
  if (requestedValue < MIN_FREE_COOLING_DT_K || requestedValue > MAX_FREE_COOLING_DT_K) {
    throw new Error(
      `${label} must be between ${MIN_FREE_COOLING_DT_K} and ${MAX_FREE_COOLING_DT_K} K.`,
    );
  }
}

function validateDeicingPercent(requestedValue: number, label: string) {
  if (requestedValue < MIN_DEICING_PERCENT || requestedValue > MAX_DEICING_PERCENT) {
    throw new Error(
      `${label} must be between ${MIN_DEICING_PERCENT} and ${MAX_DEICING_PERCENT} percent.`,
    );
  }
}

interface SuppressedSetting {
  value: unknown;
  expiresAt: number;
}

/**
 * Shared base class for Nordic Local and Nordic Cloud devices.
 * Contains all settings handling, capability registration, and suppression logic.
 * Subclasses implement onInit() with transport-specific registration.
 */
export abstract class FlexitNordicBaseDevice extends Homey.Device {
  private suppressedRegistrySettings = new Map<string, SuppressedSetting>();
  private settingsUpdateInProgress = false;
  private deferredRegistrySettings: Record<string, unknown> = {};
  private deferredFlushScheduled = false;
  private runtimeLogger?: RuntimeLogger;

  protected getLogBindings() {
    const data = this.getData();
    return {
      component: 'device',
      unitId: data.unitId,
      deviceName: this.getName(),
    };
  }

  protected getLogger() {
    if (!this.runtimeLogger) {
      this.runtimeLogger = createRuntimeLogger(this, this.getLogBindings());
    }
    return this.runtimeLogger;
  }

  protected async initSharedCapabilities() {
    await this.setClass('airtreatment');
    const { driver } = this as unknown as { driver?: { manifest?: { capabilities?: unknown } } };
    await migrateCapabilities(this, driver?.manifest?.capabilities, this.getLogger());
  }

  protected registerSharedCapabilityListeners(unitId: string) {
    this.registerCapabilityListener('target_temperature', async (value: number) => {
      const current = this.getCapabilityValue('target_temperature');
      if (normalizeTargetTemperature(current) === normalizeTargetTemperature(value)) {
        this.getLogger().info(
          'device.capability.target_temperature.skipped',
          'Skipped target temperature write because value already matches',
          {
            unitId,
            requestedValue: normalizeTargetTemperature(value),
          },
        );
        return;
      }
      await this.runCapabilityAction(
        'target_temperature',
        unitId,
        `writing setpoint ${value}`,
        async () => {
          this.getLogger().info('device.capability.target_temperature.write', 'Writing target temperature setpoint', {
            unitId,
            requestedValue: value,
          });
          await Registry.writeSetpoint(unitId, value);
        },
      );
    });

    this.registerCapabilityListener('fan_mode', async (value) => {
      await this.runCapabilityAction(
        'fan_mode',
        unitId,
        `setting fan mode '${value}'`,
        async () => {
          this.getLogger().info('device.capability.fan_mode.write', 'Writing fan mode capability', {
            unitId,
            mode: String(value),
          });
          await Registry.setFanMode(unitId, value);
        },
      );
    });

    this.registerCapabilityListener(RESET_FILTER_CAPABILITY, async () => {
      await this.runCapabilityAction(
        RESET_FILTER_CAPABILITY,
        unitId,
        'resetting filter timer',
        async () => {
          this.getLogger().info('device.capability.filter_reset.write', 'Resetting filter timer', { unitId });
          await Registry.resetFilterTimer(unitId);
        },
      );
    });
  }

  /**
   * Hook for subclasses to wrap capability actions (e.g. BACnet timeout logging).
   * Default implementation simply runs the action directly.
   */
  protected async runCapabilityAction<T>(
    _capability: string,
    _unitId: string,
    _actionDescription: string,
    action: () => Promise<T>,
  ): Promise<T> {
    return action();
  }

  async onSettings({
    newSettings,
    changedKeys,
  }: {
    newSettings: Record<string, unknown>;
    changedKeys: string[];
  }): Promise<void> {
    this.settingsUpdateInProgress = true;
    try {
      const effectiveChangedKeys = this.filterSuppressedChangedKeys(changedKeys, newSettings);
      const monthsChanged = effectiveChangedKeys.includes(FILTER_CHANGE_INTERVAL_MONTHS_SETTING);
      const legacyHoursChanged = effectiveChangedKeys.includes(
        FILTER_CHANGE_INTERVAL_HOURS_LEGACY_SETTING,
      );
      const homeTargetTemperatureChanged = effectiveChangedKeys.includes(
        TARGET_TEMPERATURE_HOME_SETTING,
      );
      const awayTargetTemperatureChanged = effectiveChangedKeys.includes(
        TARGET_TEMPERATURE_AWAY_SETTING,
      );
      const freeCoolingChanged = FREE_COOLING_SETTING_KEYS.some((key) => effectiveChangedKeys.includes(key));
      const deicingChanged = DEICING_SETTING_KEYS.some((key) => effectiveChangedKeys.includes(key));
      const unitSettingsChanged = UNIT_SETTING_KEYS.some((key) => effectiveChangedKeys.includes(key));
      const fireplaceDurationChanged = effectiveChangedKeys.includes(FIREPLACE_DURATION_SETTING);
      const highDurationChanged = effectiveChangedKeys.includes(HIGH_DURATION_SETTING);
      const changedFanModes = this.getChangedFanModes(effectiveChangedKeys);
      if (
        !monthsChanged
        && !legacyHoursChanged
        && !homeTargetTemperatureChanged
        && !awayTargetTemperatureChanged
        && !freeCoolingChanged
        && !deicingChanged
        && !unitSettingsChanged
        && !fireplaceDurationChanged
        && !highDurationChanged
        && changedFanModes.length === 0
      ) return;

      // Reject an invalid dT start/stop pair before anything is written to the unit.
      this.validateFreeCoolingDtSettings(newSettings, effectiveChangedKeys);
      this.validateUnitSettingOrder(newSettings, effectiveChangedKeys);
      this.validateFanProfileOrder(newSettings, changedFanModes);

      const { unitId } = this.getData();
      await this.maybeHandleFilterIntervalSetting(
        unitId, newSettings, monthsChanged, legacyHoursChanged,
      );
      await this.maybeHandleTargetTemperatureSetting(
        unitId, 'home', newSettings, homeTargetTemperatureChanged,
      );
      await this.maybeHandleTargetTemperatureSetting(
        unitId, 'away', newSettings, awayTargetTemperatureChanged,
      );
      await this.maybeHandleFreeCoolingSettings(unitId, newSettings, effectiveChangedKeys);
      await this.maybeHandleDeicingSettings(unitId, newSettings, effectiveChangedKeys);
      await this.maybeHandleUnitSettings(unitId, newSettings, effectiveChangedKeys);
      await this.maybeHandleFireplaceDurationSetting(
        unitId, newSettings, fireplaceDurationChanged,
      );
      await this.maybeHandleHighDurationSetting(
        unitId, newSettings, highDurationChanged,
      );
      for (const mode of changedFanModes) {
        await this.maybeHandleFanProfileModeSetting(unitId, mode, newSettings);
      }
    } finally {
      this.settingsUpdateInProgress = false;
      this.scheduleDeferredRegistrySettingsFlush();
    }
  }

  private async maybeHandleTargetTemperatureSetting(
    unitId: string,
    mode: 'home' | 'away',
    newSettings: Record<string, unknown>,
    changed: boolean,
  ) {
    if (!changed) return;

    const settingKey = mode === 'home'
      ? TARGET_TEMPERATURE_HOME_SETTING
      : TARGET_TEMPERATURE_AWAY_SETTING;
    const requestedValue = Number(newSettings[settingKey]);
    if (!Number.isFinite(requestedValue)) {
      throw new Error(`${mode} target temperature must be numeric.`);
    }
    if (requestedValue < MIN_TARGET_TEMPERATURE_C || requestedValue > MAX_TARGET_TEMPERATURE_C) {
      throw new Error(
        `${mode} target temperature must be between ${MIN_TARGET_TEMPERATURE_C}`
        + ` and ${MAX_TARGET_TEMPERATURE_C} degC.`,
      );
    }
    const normalizedRequestedValue = normalizeTargetTemperature(requestedValue);

    const currentValue = Number(this.getSetting(settingKey));
    if (
      Number.isFinite(currentValue)
      && Math.abs(currentValue - normalizedRequestedValue) < SETTING_SYNC_TOLERANCE
    ) return;

    try {
      this.getLogger().info('device.setting.target_temperature.write', 'Updating target temperature setting', {
        unitId,
        mode,
        requestedValue: normalizedRequestedValue,
      });
      await Registry.setTemperatureSetpoint(unitId, mode, normalizedRequestedValue);
    } catch (error) {
      this.getLogger().error(
        'device.setting.target_temperature.failed',
        'Failed to update target temperature setting',
        error,
        {
          unitId,
          mode,
          requestedValue: normalizedRequestedValue,
        },
      );
      throw new Error(`Failed to update ${mode} target temperature on the unit.`);
    }
  }

  /**
   * The unit only accepts away <= home <= high for each fan. A change that breaks that order is
   * rejected here with a clear message instead of being refused or clamped by the unit.
   */
  private validateFanProfileOrder(newSettings: Record<string, unknown>, changedFanModes: FanProfileMode[]) {
    if (!changedFanModes.some((mode) => mode === 'away' || mode === 'home' || mode === 'high')) return;
    const value = (mode: 'away' | 'home' | 'high', fan: 'supply' | 'exhaust') => {
      const key = FAN_PROFILE_SETTING_KEYS[mode][fan];
      const raw = newSettings[key] ?? this.getSetting(key);
      return raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
    };
    for (const fan of ['supply', 'exhaust'] as const) {
      const away = value('away', fan);
      const home = value('home', fan);
      const high = value('high', fan);
      if (Number.isFinite(away) && Number.isFinite(home) && home < away) {
        throw new Error(`Home ${fan} fan (${home} %) cannot be lower than away (${away} %).`);
      }
      if (Number.isFinite(home) && Number.isFinite(high) && high < home) {
        throw new Error(`High ${fan} fan (${high} %) cannot be lower than home (${home} %).`);
      }
    }
  }

  private getChangedFanModes(changedKeys: string[]): FanProfileMode[] {
    const changedFanModes: FanProfileMode[] = [];
    for (const mode of FAN_PROFILE_MODES) {
      const modeSettings = FAN_PROFILE_SETTING_KEYS[mode];
      if (
        !changedKeys.includes(modeSettings.supply)
        && !changedKeys.includes(modeSettings.exhaust)
      ) continue;
      changedFanModes.push(mode);
    }
    return changedFanModes;
  }

  private async maybeHandleFreeCoolingSettings(
    unitId: string,
    newSettings: Record<string, unknown>,
    changedKeys: string[],
  ) {
    await this.maybeHandleFreeCoolingEnabledSetting(
      unitId, newSettings, changedKeys.includes(FREE_COOLING_ENABLED_SETTING),
    );
    await this.maybeHandleFreeCoolingTemperatureSetting(
      unitId,
      newSettings,
      changedKeys.includes(FREE_COOLING_TEMPERATURE_SETPOINT_SETTING),
      {
        settingKey: FREE_COOLING_TEMPERATURE_SETPOINT_SETTING,
        label: 'free cooling temperature setpoint',
        update: (nextValue) => Registry.setFreeCoolingTemperatureSetpoint(unitId, nextValue),
      },
    );
    await this.maybeHandleFreeCoolingTemperatureSetting(
      unitId,
      newSettings,
      changedKeys.includes(FREE_COOLING_OUTSIDE_TEMPERATURE_LIMIT_SETTING),
      {
        settingKey: FREE_COOLING_OUTSIDE_TEMPERATURE_LIMIT_SETTING,
        label: 'free cooling outside temperature limit',
        update: (nextValue) => Registry.setFreeCoolingOutsideTemperatureLimit(unitId, nextValue),
      },
    );
    await this.maybeHandleFreeCoolingMinOnTimeSetting(
      unitId, newSettings, changedKeys.includes(FREE_COOLING_MIN_ON_TIME_SECONDS_SETTING),
    );
    await this.maybeHandleFreeCoolingDtSettings(unitId, newSettings, changedKeys);
  }

  private validateFreeCoolingDtSettings(newSettings: Record<string, unknown>, changedKeys: string[]) {
    const startChanged = changedKeys.includes(FREE_COOLING_DT_START_SETTING);
    const stopChanged = changedKeys.includes(FREE_COOLING_DT_STOP_SETTING);
    if (!startChanged && !stopChanged) return;

    const start = this.resolveRequestedFreeCoolingDt(newSettings, {
      settingKey: FREE_COOLING_DT_START_SETTING, label: FREE_COOLING_DT_START_LABEL, changed: startChanged,
    });
    const stop = this.resolveRequestedFreeCoolingDt(newSettings, {
      settingKey: FREE_COOLING_DT_STOP_SETTING, label: FREE_COOLING_DT_STOP_LABEL, changed: stopChanged,
    });
    if (start === undefined || stop === undefined || stop < start) return;

    throw new Error(
      `The free cooling stop temperature difference (${stop} K) must be lower than`
      + ` the start temperature difference (${start} K).`,
    );
  }

  /** The new value when the setting changed, otherwise the current one; undefined if unknown. */
  private resolveRequestedFreeCoolingDt(
    newSettings: Record<string, unknown>,
    config: { settingKey: string; label: string; changed: boolean },
  ): number | undefined {
    if (!config.changed) return this.getFiniteSetting(config.settingKey);

    const requestedValue = Number(newSettings[config.settingKey]);
    if (!Number.isFinite(requestedValue)) {
      throw new Error(`${config.label} must be numeric.`);
    }
    validateFreeCoolingDt(requestedValue, config.label);
    return normalizeFreeCoolingDt(requestedValue);
  }

  private async maybeHandleFreeCoolingDtSettings(
    unitId: string,
    newSettings: Record<string, unknown>,
    changedKeys: string[],
  ) {
    const startChanged = changedKeys.includes(FREE_COOLING_DT_START_SETTING);
    const stopChanged = changedKeys.includes(FREE_COOLING_DT_STOP_SETTING);
    if (!startChanged && !stopChanged) return;

    const writeStart = () => this.maybeHandleNumericSetting(unitId, newSettings, startChanged, {
      settingKey: FREE_COOLING_DT_START_SETTING,
      label: FREE_COOLING_DT_START_LABEL,
      normalize: normalizeFreeCoolingDt,
      validate: validateFreeCoolingDt,
      update: (nextValue) => Registry.setFreeCoolingDtStart(unitId, nextValue),
      formatValue: (nextValue) => `${nextValue} K`,
    });
    const writeStop = () => this.maybeHandleNumericSetting(unitId, newSettings, stopChanged, {
      settingKey: FREE_COOLING_DT_STOP_SETTING,
      label: FREE_COOLING_DT_STOP_LABEL,
      normalize: normalizeFreeCoolingDt,
      validate: validateFreeCoolingDt,
      update: (nextValue) => Registry.setFreeCoolingDtStop(unitId, nextValue),
      formatValue: (nextValue) => `${nextValue} K`,
    });

    // When both thresholds move, write them in the order that keeps stop below start on
    // the unit between the two writes: lowering both means the stop value has to go first.
    const currentStop = this.getFiniteSetting(FREE_COOLING_DT_STOP_SETTING);
    const stopFirst = startChanged
      && stopChanged
      && currentStop !== undefined
      && currentStop >= normalizeFreeCoolingDt(newSettings[FREE_COOLING_DT_START_SETTING]);
    if (stopFirst) {
      await writeStop();
      await writeStart();
      return;
    }
    await writeStart();
    await writeStop();
  }

  private async maybeHandleDeicingSettings(
    unitId: string,
    newSettings: Record<string, unknown>,
    changedKeys: string[],
  ) {
    await this.maybeHandleBooleanSetting(unitId, newSettings, changedKeys.includes(DEICING_ENABLED_SETTING), {
      settingKey: DEICING_ENABLED_SETTING,
      label: 'de-icing enabled',
      update: (nextValue) => Registry.setDeicingEnabled(unitId, nextValue),
    });

    const percentSettings = [
      {
        settingKey: DEICING_ROTOR_SPEED_SETTING,
        label: 'de-icing rotor speed',
        update: (nextValue: number) => Registry.setDeicingRotorSpeedPercent(unitId, nextValue),
      },
      {
        settingKey: DEICING_SUPPLY_FAN_SETTING,
        label: 'de-icing supply fan speed',
        update: (nextValue: number) => Registry.setDeicingSupplyFanPercent(unitId, nextValue),
      },
      {
        settingKey: DEICING_EXHAUST_FAN_SETTING,
        label: 'de-icing exhaust fan speed',
        update: (nextValue: number) => Registry.setDeicingExhaustFanPercent(unitId, nextValue),
      },
    ];
    for (const setting of percentSettings) {
      await this.maybeHandleNumericSetting(unitId, newSettings, changedKeys.includes(setting.settingKey), {
        ...setting,
        normalize: normalizeDeicingPercent,
        validate: validateDeicingPercent,
        formatValue: (nextValue) => `${nextValue}%`,
      });
    }
  }

  private validateUnitSettingOrder(newSettings: Record<string, unknown>, changedKeys: string[]) {
    for (const rule of UNIT_SETTING_ORDER_RULES) {
      if (!changedKeys.includes(rule.lower) && !changedKeys.includes(rule.higher)) continue;
      const lower = this.resolveRequestedUnitSetting(newSettings, changedKeys, rule.lower);
      const higher = this.resolveRequestedUnitSetting(newSettings, changedKeys, rule.higher);
      if (lower !== undefined && higher !== undefined && lower >= higher) throw new Error(rule.message);
    }
  }

  /** The new value when the setting changed, otherwise the current one; undefined if unknown. */
  private resolveRequestedUnitSetting(
    newSettings: Record<string, unknown>,
    changedKeys: string[],
    settingKey: string,
  ): number | undefined {
    const setting = findUnitNumericSetting(settingKey);
    if (!setting) return undefined;
    if (!changedKeys.includes(settingKey)) return this.getFiniteSetting(settingKey);
    return normalizeUnitNumericSetting(setting, newSettings[settingKey]);
  }

  private async maybeHandleUnitSettings(
    unitId: string,
    newSettings: Record<string, unknown>,
    changedKeys: string[],
  ) {
    await this.maybeHandleBooleanSetting(unitId, newSettings, changedKeys.includes(HEATING_COIL_ENABLED_SETTING), {
      settingKey: HEATING_COIL_ENABLED_SETTING,
      label: 'electric heating coil',
      update: async (nextValue) => {
        await Registry.setHeatingCoilEnabled(unitId, nextValue);
      },
    });
    for (const setting of UNIT_NUMERIC_SETTINGS) {
      await this.maybeHandleNumericSetting(unitId, newSettings, changedKeys.includes(setting.settingKey), {
        settingKey: setting.settingKey,
        label: setting.label,
        normalize: (value) => normalizeUnitNumericSetting(setting, value),
        update: (nextValue) => Registry.setUnitNumericSetting(unitId, setting.settingKey, nextValue),
        formatValue: (nextValue) => `${nextValue} ${setting.unit}`,
      });
    }
  }

  private async maybeHandleBooleanSetting(
    unitId: string,
    newSettings: Record<string, unknown>,
    changed: boolean,
    config: {
      settingKey: string;
      label: string;
      update: (value: boolean) => Promise<void>;
    },
  ) {
    if (!changed) return;

    const { settingKey, label, update } = config;
    const requestedValue = Boolean(newSettings[settingKey]);
    if (this.getSetting(settingKey) === requestedValue) return;

    try {
      this.getLogger().info('device.setting.boolean.write', 'Updating boolean device setting', {
        unitId,
        settingKey,
        label,
        requestedValue,
      });
      await update(requestedValue);
    } catch (error) {
      this.getLogger().error('device.setting.boolean.failed', 'Failed to update boolean device setting', error, {
        unitId,
        settingKey,
        label,
        requestedValue,
      });
      throw new Error(`Failed to update ${label} on the unit.`);
    }
  }

  private getFiniteSetting(settingKey: string): number | undefined {
    const value = this.getSetting(settingKey);
    if (value === null || value === undefined || value === '') return undefined;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  private async maybeHandleFreeCoolingEnabledSetting(
    unitId: string,
    newSettings: Record<string, unknown>,
    changed: boolean,
  ) {
    if (!changed) return;

    const requestedValue = Boolean(newSettings[FREE_COOLING_ENABLED_SETTING]);
    const currentValue = this.getSetting(FREE_COOLING_ENABLED_SETTING);
    if (currentValue === requestedValue) return;

    try {
      this.getLogger().info('device.setting.free_cooling_enabled.write', 'Updating free cooling enabled setting', {
        unitId,
        requestedValue,
      });
      await Registry.setFreeCoolingEnabled(unitId, requestedValue);
    } catch (error) {
      this.getLogger().error(
        'device.setting.free_cooling_enabled.failed',
        'Failed to update free cooling enabled setting',
        error,
        {
          unitId,
          requestedValue,
        },
      );
      throw new Error('Failed to update free cooling enabled on the unit.');
    }
  }

  private async maybeHandleFreeCoolingTemperatureSetting(
    unitId: string,
    newSettings: Record<string, unknown>,
    changed: boolean,
    config: {
      settingKey: string;
      label: string;
      update: (value: number) => Promise<void>;
    },
  ) {
    if (!changed) return;
    await this.maybeHandleNumericSetting(unitId, newSettings, changed, {
      ...config,
      normalize: normalizeFreeCoolingTemperature,
      validate: (requestedValue, label) => {
        if (requestedValue < MIN_FREE_COOLING_TEMPERATURE_C
          || requestedValue > MAX_FREE_COOLING_TEMPERATURE_C) {
          throw new Error(
            `${label} must be between ${MIN_FREE_COOLING_TEMPERATURE_C}`
            + ` and ${MAX_FREE_COOLING_TEMPERATURE_C} degC.`,
          );
        }
      },
    });
  }

  private async maybeHandleFreeCoolingMinOnTimeSetting(
    unitId: string,
    newSettings: Record<string, unknown>,
    changed: boolean,
  ) {
    await this.maybeHandleNumericSetting(unitId, newSettings, changed, {
      settingKey: FREE_COOLING_MIN_ON_TIME_SECONDS_SETTING,
      label: 'free cooling minimum on-time',
      normalize: normalizeFreeCoolingMinOnTimeSeconds,
      validate: (requestedValue) => {
        if (requestedValue < MIN_FREE_COOLING_MIN_ON_TIME_SECONDS
          || requestedValue > MAX_FREE_COOLING_MIN_ON_TIME_SECONDS) {
          throw new Error(
            `Free cooling minimum on-time must be between ${MIN_FREE_COOLING_MIN_ON_TIME_SECONDS}`
            + ` and ${MAX_FREE_COOLING_MIN_ON_TIME_SECONDS} seconds.`,
          );
        }
      },
      update: (nextValue) => Registry.setFreeCoolingMinOnTimeSeconds(unitId, nextValue),
      formatValue: (nextValue) => `${nextValue}s`,
    });
  }

  private async maybeHandleNumericSetting(
    unitId: string,
    newSettings: Record<string, unknown>,
    changed: boolean,
    config: {
      settingKey: string;
      label: string;
      normalize: (value: unknown) => number;
      validate?: (requestedValue: number, label: string) => void;
      update: (value: number) => Promise<void>;
      formatValue?: (value: number) => string;
    },
  ) {
    if (!changed) return;

    const {
      settingKey,
      label,
      normalize,
      validate,
      update,
      formatValue = (value) => `${value}`,
    } = config;

    const requestedValue = Number(newSettings[settingKey]);
    if (!Number.isFinite(requestedValue)) {
      throw new Error(`${label} must be numeric.`);
    }
    validate?.(requestedValue, label);

    const normalizedRequestedValue = normalize(requestedValue);
    const currentValue = Number(this.getSetting(settingKey));
    if (
      Number.isFinite(currentValue)
      && Math.abs(currentValue - normalizedRequestedValue) < SETTING_SYNC_TOLERANCE
    ) return;

    try {
      this.getLogger().info('device.setting.numeric.write', 'Updating numeric device setting', {
        unitId,
        settingKey,
        label,
        requestedValue: formatValue(normalizedRequestedValue),
      });
      await update(normalizedRequestedValue);
    } catch (error) {
      this.getLogger().error('device.setting.numeric.failed', 'Failed to update numeric device setting', error, {
        unitId,
        settingKey,
        label,
        requestedValue: formatValue(normalizedRequestedValue),
      });
      throw new Error(`Failed to update ${label} on the unit.`);
    }
  }

  private async maybeHandleFilterIntervalSetting(
    unitId: string,
    newSettings: Record<string, unknown>,
    monthsChanged: boolean,
    legacyHoursChanged: boolean,
  ) {
    if (!monthsChanged && !legacyHoursChanged) return;

    let requestedHours: number;
    if (monthsChanged) {
      const requestedMonths = Number(newSettings[FILTER_CHANGE_INTERVAL_MONTHS_SETTING]);
      if (
        !Number.isFinite(requestedMonths)
        || requestedMonths < MIN_FILTER_CHANGE_INTERVAL_MONTHS
        || requestedMonths > MAX_FILTER_CHANGE_INTERVAL_MONTHS
      ) {
        throw new Error(
          `Filter change interval must be between ${MIN_FILTER_CHANGE_INTERVAL_MONTHS}`
          + ` and ${MAX_FILTER_CHANGE_INTERVAL_MONTHS} months.`,
        );
      }
      requestedHours = filterIntervalMonthsToHours(requestedMonths);
    } else {
      requestedHours = Number(newSettings[FILTER_CHANGE_INTERVAL_HOURS_LEGACY_SETTING]);
      if (
        !Number.isFinite(requestedHours)
        || requestedHours < MIN_FILTER_CHANGE_INTERVAL_HOURS
        || requestedHours > MAX_FILTER_CHANGE_INTERVAL_HOURS
      ) {
        throw new Error(
          `Filter change interval must be between ${MIN_FILTER_CHANGE_INTERVAL_HOURS}`
          + ` and ${MAX_FILTER_CHANGE_INTERVAL_HOURS} hours.`,
        );
      }
    }

    const currentMonths = Number(this.getSetting(FILTER_CHANGE_INTERVAL_MONTHS_SETTING));
    const currentHours = Number(this.getSetting(FILTER_CHANGE_INTERVAL_HOURS_LEGACY_SETTING));
    const requestedMonths = filterIntervalHoursToMonths(requestedHours);
    const monthsInSync = Number.isFinite(currentMonths)
      && Math.abs(currentMonths - requestedMonths) < 0.5;
    const hoursInSync = Number.isFinite(currentHours)
      && Math.abs(currentHours - requestedHours) < 0.5;
    if (monthsInSync && hoursInSync) return;

    try {
      this.getLogger().info('device.setting.filter_interval.write', 'Updating filter change interval setting', {
        unitId,
        requestedHours,
        requestedMonths,
      });
      await Registry.setFilterChangeInterval(unitId, requestedHours);
    } catch (error) {
      this.getLogger().error(
        'device.setting.filter_interval.failed',
        'Failed to update filter change interval setting',
        error,
        {
          unitId,
          requestedHours,
          requestedMonths,
        },
      );
      throw new Error('Failed to update filter change interval on the unit.');
    }
  }

  private async maybeHandleFanProfileModeSetting(
    unitId: string,
    mode: FanProfileMode,
    newSettings: Record<string, unknown>,
  ) {
    const modeSettings = FAN_PROFILE_SETTING_KEYS[mode];
    const requestedSupply = Number(
      newSettings[modeSettings.supply] ?? this.getSetting(modeSettings.supply),
    );
    const requestedExhaust = Number(
      newSettings[modeSettings.exhaust] ?? this.getSetting(modeSettings.exhaust),
    );
    if (!Number.isFinite(requestedSupply) || !Number.isFinite(requestedExhaust)) {
      throw new Error(`Both supply and exhaust values are required for ${mode} fan settings.`);
    }
    const normalizedSupply = normalizeFanProfilePercent(requestedSupply, mode, 'supply');
    const normalizedExhaust = normalizeFanProfilePercent(requestedExhaust, mode, 'exhaust');

    const currentSupply = Number(this.getSetting(modeSettings.supply));
    const currentExhaust = Number(this.getSetting(modeSettings.exhaust));
    const supplyInSync = Number.isFinite(currentSupply)
      && Math.abs(currentSupply - normalizedSupply) < 0.5;
    const exhaustInSync = Number.isFinite(currentExhaust)
      && Math.abs(currentExhaust - normalizedExhaust) < 0.5;
    if (supplyInSync && exhaustInSync) return;

    try {
      this.getLogger().info('device.setting.fan_profile.write', 'Updating fan profile setting', {
        unitId,
        mode,
        supplyPercent: normalizedSupply,
        exhaustPercent: normalizedExhaust,
      });
      await Registry.setFanProfileMode(unitId, mode, normalizedSupply, normalizedExhaust);
    } catch (error) {
      this.getLogger().error('device.setting.fan_profile.failed', 'Failed to update fan profile setting', error, {
        unitId,
        mode,
        supplyPercent: normalizedSupply,
        exhaustPercent: normalizedExhaust,
      });
      throw new Error(`Failed to update ${mode} fan profile on the unit.`);
    }
  }

  private async maybeHandleFireplaceDurationSetting(
    unitId: string,
    newSettings: Record<string, unknown>,
    changed: boolean,
  ) {
    if (!changed) return;

    const normalizedDurationMinutes = normalizeFireplaceDurationMinutes(
      newSettings[FIREPLACE_DURATION_SETTING],
    );

    const currentDurationMinutes = Number(this.getSetting(FIREPLACE_DURATION_SETTING));
    if (
      Number.isFinite(currentDurationMinutes)
      && Math.abs(currentDurationMinutes - normalizedDurationMinutes) < SETTING_SYNC_TOLERANCE
    ) return;

    try {
      this.getLogger().info('device.setting.fireplace_duration.write', 'Updating fireplace duration setting', {
        unitId,
        durationMinutes: normalizedDurationMinutes,
      });
      await Registry.setFireplaceVentilationDuration(unitId, normalizedDurationMinutes);
    } catch (error) {
      this.getLogger().error(
        'device.setting.fireplace_duration.failed',
        'Failed to update fireplace duration setting',
        error,
        {
          unitId,
          durationMinutes: normalizedDurationMinutes,
        },
      );
      throw new Error('Failed to update fireplace duration on the unit.');
    }
  }

  private async maybeHandleHighDurationSetting(
    unitId: string,
    newSettings: Record<string, unknown>,
    changed: boolean,
  ) {
    if (!changed) return;

    const normalizedDurationMinutes = normalizeHighDurationMinutes(
      newSettings[HIGH_DURATION_SETTING],
    );

    const currentDurationMinutes = Number(this.getSetting(HIGH_DURATION_SETTING));
    if (
      Number.isFinite(currentDurationMinutes)
      && Math.abs(currentDurationMinutes - normalizedDurationMinutes) < SETTING_SYNC_TOLERANCE
    ) return;

    try {
      this.getLogger().info('device.setting.high_duration.write', 'Updating high duration setting', {
        unitId,
        durationMinutes: normalizedDurationMinutes,
      });
      await Registry.setRapidVentilationDuration(unitId, normalizedDurationMinutes);
    } catch (error) {
      this.getLogger().error(
        'device.setting.high_duration.failed',
        'Failed to update high duration setting',
        error,
        {
          unitId,
          durationMinutes: normalizedDurationMinutes,
        },
      );
      throw new Error('Failed to update high duration on the unit.');
    }
  }

  async applyRegistrySettings(settings: Record<string, unknown>): Promise<void> {
    if (this.settingsUpdateInProgress) {
      for (const [key, value] of Object.entries(settings)) {
        this.deferredRegistrySettings[key] = value;
      }
      return;
    }

    const expiresAt = Date.now() + REGISTRY_SETTING_SUPPRESSION_WINDOW_MS;
    for (const [key, value] of Object.entries(settings)) {
      this.suppressedRegistrySettings.set(key, { value, expiresAt });
    }
    await this.setSettings(settings);
  }

  private async flushDeferredRegistrySettings() {
    if (this.settingsUpdateInProgress) return;

    const deferredEntries = Object.entries(this.deferredRegistrySettings);
    if (deferredEntries.length === 0) return;

    this.deferredRegistrySettings = {};
    const deferredSettings = Object.fromEntries(deferredEntries);
    try {
      await this.applyRegistrySettings(deferredSettings);
    } catch (error) {
      this.deferredRegistrySettings = {
        ...deferredSettings,
        ...this.deferredRegistrySettings,
      };
      this.getLogger().error(
        'device.registry_settings.deferred_apply.failed',
        'Failed to apply deferred registry settings',
        error,
        {
          deferredSettings: deferredSettings as any,
        },
      );
    }
  }

  private scheduleDeferredRegistrySettingsFlush() {
    if (this.deferredFlushScheduled) return;
    this.deferredFlushScheduled = true;
    setTimeout(() => {
      this.deferredFlushScheduled = false;
      this.flushDeferredRegistrySettings().catch((error) => {
        this.getLogger().error(
          'device.registry_settings.deferred_flush.failed',
          'Unexpected deferred registry settings flush failure',
          error,
        );
      });
    }, 0);
  }

  private filterSuppressedChangedKeys(
    changedKeys: string[],
    newSettings: Record<string, unknown>,
  ): string[] {
    const remaining: string[] = [];
    for (const key of changedKeys) {
      if (!this.isSuppressedRegistrySettingChange(key, newSettings[key])) {
        remaining.push(key);
      }
    }
    return remaining;
  }

  private isSuppressedRegistrySettingChange(key: string, nextValue: unknown): boolean {
    const entry = this.suppressedRegistrySettings.get(key);
    if (!entry) return false;

    if (entry.expiresAt < Date.now()) {
      this.suppressedRegistrySettings.delete(key);
      return false;
    }

    if (!this.settingsValuesMatch(entry.value, nextValue)) {
      return false;
    }

    this.suppressedRegistrySettings.delete(key);
    return true;
  }

  private settingsValuesMatch(expected: unknown, actual: unknown): boolean {
    const expectedNumber = Number(expected);
    const actualNumber = Number(actual);
    if (Number.isFinite(expectedNumber) && Number.isFinite(actualNumber)) {
      return Math.abs(expectedNumber - actualNumber) < SETTING_SYNC_TOLERANCE;
    }
    return expected === actual;
  }

  async onDeleted() {
    Registry.unregister(this.getData().unitId, this as unknown as FlexitDevice);
    this.getLogger().info('device.deleted', 'Device deleted');
  }
}
