/**
 * Unit settings from the Flexit GO service menus that are mirrored as device settings:
 * supplementary heating and outdoor temperature compensation. Pure definitions, so the
 * registry (BACnet and cloud writes) and the device settings handler share one source.
 */

export const HEATING_COIL_ENABLED_SETTING = 'heating_coil_enabled';

export interface UnitNumericSettingDefinition {
  settingKey: string;
  label: string;
  unit: 'K' | 'degC';
  min: number;
  max: number;
  step: number;
}

export const UNIT_NUMERIC_SETTINGS: ReadonlyArray<UnitNumericSettingDefinition> = [
  {
    settingKey: 'heating_neutral_zone_home_k',
    label: 'Heating coil neutral zone, home',
    unit: 'K',
    min: 0,
    max: 10,
    step: 0.5,
  },
  {
    settingKey: 'heating_neutral_zone_away_k',
    label: 'Heating coil neutral zone, away',
    unit: 'K',
    min: 0,
    max: 10,
    step: 0.5,
  },
  {
    settingKey: 'winter_compensation_k',
    label: 'Winter compensation',
    unit: 'K',
    min: -10,
    max: 10,
    step: 0.5,
  },
  {
    settingKey: 'winter_compensation_start_c',
    label: 'Winter compensation start temperature',
    unit: 'degC',
    min: -40,
    max: 10,
    step: 0.5,
  },
  {
    settingKey: 'winter_compensation_end_c',
    label: 'Winter compensation end temperature',
    unit: 'degC',
    min: -40,
    max: 10,
    step: 0.5,
  },
  {
    settingKey: 'summer_compensation_k',
    label: 'Summer compensation',
    unit: 'K',
    min: -10,
    max: 10,
    step: 0.5,
  },
  {
    settingKey: 'summer_compensation_start_c',
    label: 'Summer compensation start temperature',
    unit: 'degC',
    min: 0,
    max: 40,
    step: 0.5,
  },
  {
    settingKey: 'summer_compensation_end_c',
    label: 'Summer compensation end temperature',
    unit: 'degC',
    min: 0,
    max: 40,
    step: 0.5,
  },
  {
    // Not shown in Flexit GO. Free cooling only starts once the extract air is this much above
    // the extract air setpoint (factory value 2 K).
    settingKey: 'free_cooling_start_margin_k',
    label: 'Free cooling start margin above setpoint',
    unit: 'K',
    min: 0,
    max: 10,
    step: 0.5,
  },
];

export interface UnitSettingOrderRule {
  lower: string;
  higher: string;
  message: string;
}

/** Winter compensation ramps in towards colder outdoor air, summer compensation towards warmer. */
export const UNIT_SETTING_ORDER_RULES: ReadonlyArray<UnitSettingOrderRule> = [
  {
    lower: 'winter_compensation_end_c',
    higher: 'winter_compensation_start_c',
    message: 'The winter compensation end temperature must be below the start temperature.',
  },
  {
    lower: 'summer_compensation_start_c',
    higher: 'summer_compensation_end_c',
    message: 'The summer compensation end temperature must be above the start temperature.',
  },
];

export function findUnitNumericSetting(settingKey: string): UnitNumericSettingDefinition | undefined {
  return UNIT_NUMERIC_SETTINGS.find((setting) => setting.settingKey === settingKey);
}

export function normalizeUnitNumericSetting(setting: UnitNumericSettingDefinition, value: unknown): number {
  const numeric = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(numeric)) {
    throw new Error(`${setting.label} must be numeric`);
  }
  if (numeric < setting.min || numeric > setting.max) {
    throw new Error(`${setting.label} must be between ${setting.min} and ${setting.max} ${setting.unit}`);
  }
  const stepped = Math.round(numeric / setting.step) * setting.step;
  // Number() also turns -0 into 0.
  return Number(stepped.toFixed(1)) + 0;
}
