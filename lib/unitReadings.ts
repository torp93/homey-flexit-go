import { BacnetEnums } from './bacnetClient';

const OBJECT_TYPE = BacnetEnums.ObjectType;

export interface UnitObjectId {
  type: number;
  instance: number;
}

const analogValue = (instance: number): UnitObjectId => ({ type: OBJECT_TYPE.ANALOG_VALUE, instance });
const analogOutput = (instance: number): UnitObjectId => ({ type: OBJECT_TYPE.ANALOG_OUTPUT, instance });

export const FILTER_LIFE_CAPABILITY = 'measure_filter_life_percent';
export const ALARM_ACTIVE_CAPABILITY = 'unit_alarm_active';
export const HEATING_COIL_HOURS_CAPABILITY = 'measure_heating_coil_hours';
export const ACTIVE_ALARMS_SETTING = 'active_alarms';

/** Live values read on every poll, each published as an Insights-logged capability. */
export const LIVE_READINGS: ReadonlyArray<{ objectId: UnitObjectId; dataKey: string; capability: string }> = [
  {
    objectId: analogValue(2023),
    dataKey: 'heat_recovery_efficiency',
    capability: 'measure_heat_recovery_efficiency',
  },
  { objectId: analogOutput(0), dataKey: 'heat_exchanger_percent', capability: 'measure_heat_exchanger_percent' },
  {
    objectId: analogOutput(29),
    dataKey: 'heating_coil_output_percent',
    capability: 'measure_heating_coil_output_percent',
  },
  {
    objectId: analogValue(196),
    dataKey: 'heating_coil_demand_percent',
    capability: 'measure_heating_coil_demand_percent',
  },
  {
    objectId: analogValue(132),
    dataKey: 'supply_air_setpoint_present',
    capability: 'measure_supply_air_setpoint_present',
  },
  // Minutes since the unit started; a drop means it restarted.
  { objectId: analogValue(2361), dataKey: 'uptime_minutes', capability: 'measure_unit_uptime' },
];

/**
 * Boolean states are logged in Insights, but boolean logs do not show in every Insights view, so
 * each state is mirrored as a hidden 0/1 number capability as well.
 */
export const BOOLEAN_MIRROR_CAPABILITIES: Readonly<Record<string, string>> = {
  dehumidification_active: 'measure_dehumidification_active',
  free_cooling_active: 'measure_free_cooling_active',
  ventilation_stopped: 'measure_ventilation_stopped',
  deicing_active: 'measure_deicing_active',
  [ALARM_ACTIVE_CAPABILITY]: 'measure_unit_alarm_active',
};

export interface UnitLabelPoint {
  objectId: UnitObjectId;
  settingKey: string;
  format: (value: number) => string | undefined;
}

export function formatHoursLabel(value: number): string {
  return `${Math.round(value)} h`;
}

export function formatPercentLabel(value: number): string {
  return `${Math.round(value)} %`;
}

export function formatKilowattLabel(value: number): string {
  return `${Number(value.toFixed(2))} kW`;
}

const hoursLabel = (instance: number, settingKey: string): UnitLabelPoint => ({
  objectId: analogValue(instance),
  settingKey,
  format: formatHoursLabel,
});

/** Flexit GO "Driftstimer": counters kept by the unit, shown as read-only labels. */
export const OPERATING_HOURS_LABEL_POINTS: ReadonlyArray<UnitLabelPoint> = [
  hoursLabel(1847, 'runtime_total_hours'),
  hoursLabel(1913, 'runtime_stop_hours'),
  hoursLabel(1914, 'runtime_away_hours'),
  hoursLabel(1915, 'runtime_home_hours'),
  hoursLabel(1916, 'runtime_high_hours'),
  hoursLabel(1814, 'runtime_fireplace_hours'),
  hoursLabel(1820, 'runtime_cooker_hood_hours'),
  hoursLabel(1851, 'runtime_heat_exchanger_hours'),
  hoursLabel(1879, 'runtime_electric_heater_hours'),
];

export const UNIT_STATUS_LABEL_POINTS: ReadonlyArray<UnitLabelPoint> = [
  { objectId: analogValue(2091), settingKey: 'minimum_fan_speed', format: formatPercentLabel },
  { objectId: analogValue(190), settingKey: 'heating_coil_nominal_power', format: formatKilowattLabel },
];

/** The electric heater operating hours are also logged in Insights. */
export const HEATING_COIL_HOURS_DATA_KEY = 'runtime_electric_heater_hours';

export interface UnitAlarmDefinition {
  instance: number;
  code: string;
  name: string;
}

/** Alarm flags (BINARY_VALUE), with the Flexit alarm code and name from the unit's point list. */
export const UNIT_ALARMS: ReadonlyArray<UnitAlarmDefinition> = [
  { instance: 11, code: '', name: 'Fire alarm' },
  { instance: 430, code: '', name: 'Fire damper, alarm' },
  { instance: 431, code: '', name: 'Duct air temperature fire alarm' },
  { instance: 495, code: '2001', name: 'Emergency off activated' },
  { instance: 496, code: '2002', name: 'Smoke detector tripped' },
  { instance: 497, code: '2003', name: 'CO detector tripped' },
  { instance: 498, code: '2004', name: 'Fire alarm activated' },
  { instance: 499, code: '1009', name: 'Fire damper, position feedback fault' },
  { instance: 500, code: '2005', name: 'Supply air temperature, operating limits exceeded' },
  { instance: 501, code: '1001', name: 'Supply air temperature, sensor fault' },
  { instance: 502, code: '1005', name: 'Heating coil frost protection temperature, sensor fault' },
  { instance: 503, code: '1010', name: 'Supply air fan, speed feedback fault' },
  { instance: 504, code: '1011', name: 'Exhaust air fan, speed feedback fault' },
  { instance: 505, code: '2007', name: 'Heating coil, frost warning' },
  { instance: 506, code: '2009', name: 'Reheating coil zone, overtemperature' },
  { instance: 507, code: '2010', name: 'Heating coil, overtemperature' },
  { instance: 508, code: '2011', name: 'Reheating coil zone, frost warning' },
  { instance: 509, code: '2014', name: 'Heat pump air damper stops air flow' },
  { instance: 510, code: '1029', name: 'Reheating zone frost protection temperature, sensor fault' },
  { instance: 511, code: '1004', name: 'Outside air temperature, sensor fault' },
  { instance: 512, code: '1007', name: 'Rotary heat exchanger, motor stuck' },
  { instance: 513, code: '1008', name: 'Rotary heat exchanger, belt broken' },
  { instance: 514, code: '2015', name: 'Heat pump, common alarm' },
  { instance: 515, code: '3001', name: 'Heat pump controller, Modbus communication error' },
  { instance: 516, code: '3002', name: 'I/O extension module 1, Modbus communication error' },
  { instance: 517, code: '3003', name: 'I/O extension module 2, Modbus communication error' },
  { instance: 518, code: '3004', name: 'Differential pressure sensor, Modbus communication error' },
  { instance: 519, code: '1002', name: 'Exhaust air temperature, sensor fault' },
  { instance: 520, code: '1003', name: 'Extract air temperature, sensor fault' },
  { instance: 521, code: '1006', name: 'Extract air humidity, sensor fault' },
  { instance: 522, code: '1020', name: 'Air filter polluted' },
  { instance: 523, code: '1030', name: 'Zone supply air temperature, sensor fault' },
  { instance: 524, code: '1032', name: 'Supply air pressure, sensor fault' },
  { instance: 525, code: '1033', name: 'Extract air pressure, sensor fault' },
  { instance: 526, code: '1034', name: 'Supply air fan differential pressure, sensor fault' },
  { instance: 527, code: '1035', name: 'Exhaust air fan differential pressure, sensor fault' },
  { instance: 528, code: '3006', name: 'RF interface device, Modbus communication error' },
  { instance: 529, code: '3007', name: 'RF communication error' },
  { instance: 530, code: '1040', name: 'RF device, battery low' },
  { instance: 580, code: '2013', name: 'Outside air damper stops air flow' },
  { instance: 587, code: '1039', name: 'Rotary heat exchanger motor short circuit' },
  { instance: 634, code: '2025', name: 'Heat exchanger lost control' },
  { instance: 635, code: '2024', name: 'Heating coil lost control' },
  { instance: 642, code: '', name: 'Device warm restart' },
];

export function alarmDataKey(instance: number): string {
  return `alarm_${instance}`;
}

export function alarmObjectId(instance: number): UnitObjectId {
  return { type: OBJECT_TYPE.BINARY_VALUE, instance };
}

/** The active alarms, or undefined when no alarm flag was part of the polled data. */
export function resolveActiveAlarms(data: Record<string, number>): UnitAlarmDefinition[] | undefined {
  let seen = false;
  const active: UnitAlarmDefinition[] = [];
  for (const alarm of UNIT_ALARMS) {
    const value = data[alarmDataKey(alarm.instance)];
    if (value === undefined || !Number.isFinite(value)) continue;
    seen = true;
    if (Math.round(value) !== 0) active.push(alarm);
  }
  return seen ? active : undefined;
}

export function formatAlarm(alarm: UnitAlarmDefinition): string {
  return alarm.code ? `${alarm.name} (${alarm.code})` : alarm.name;
}

export function formatActiveAlarmsLabel(active: ReadonlyArray<UnitAlarmDefinition>): string {
  return active.length === 0 ? 'None' : active.map(formatAlarm).join('; ');
}

export type UnitEventType =
  | 'alarm_raised'
  | 'alarm_cleared'
  | 'deicing_started'
  | 'deicing_stopped'
  | 'heating_coil_started_heating'
  | 'heating_coil_stopped_heating'
  | 'unit_restarted'
  | 'heat_recovery_efficiency_changed'
  | 'heat_exchanger_speed_changed'
  | 'heating_coil_output_changed'
  | 'filter_life_changed';

export interface UnitEventPayload {
  type: UnitEventType;
  tokens: Record<string, string | number>;
  state: Record<string, number>;
}

/** What the registry remembers between polls to detect changes. */
export interface UnitReadings {
  activeAlarmInstances?: number[];
  alarmActive?: boolean;
  deicingActive?: boolean;
  heating?: boolean;
  uptimeMinutes?: number;
  heatRecoveryEfficiency?: number;
  heatExchangerSpeed?: number;
  heatingCoilOutput?: number;
  filterLife?: number;
}

export interface UnitReadingSnapshot {
  activeAlarms?: ReadonlyArray<UnitAlarmDefinition>;
  deicingActive?: boolean;
  heatingCoilOutput?: number;
  uptimeMinutes?: number;
  heatRecoveryEfficiency?: number;
  heatExchangerSpeed?: number;
  filterLife?: number;
}

type RoundedReadingKey = 'heatRecoveryEfficiency' | 'heatExchangerSpeed' | 'heatingCoilOutput' | 'filterLife';

const ROUNDED_READINGS: ReadonlyArray<{ key: RoundedReadingKey; type: UnitEventType; token: string }> = [
  { key: 'heatRecoveryEfficiency', type: 'heat_recovery_efficiency_changed', token: 'efficiency' },
  { key: 'heatExchangerSpeed', type: 'heat_exchanger_speed_changed', token: 'speed' },
  { key: 'heatingCoilOutput', type: 'heating_coil_output_changed', token: 'output' },
  { key: 'filterLife', type: 'filter_life_changed', token: 'filter_life' },
];

function alarmTokens(alarm: UnitAlarmDefinition) {
  return { alarm: alarm.name, code: alarm.code };
}

function observeAlarms(
  readings: UnitReadings,
  active: ReadonlyArray<UnitAlarmDefinition> | undefined,
  events: UnitEventPayload[],
) {
  if (active === undefined) return;
  const current = active.map((alarm) => alarm.instance);
  const previous = readings.activeAlarmInstances;
  readings.activeAlarmInstances = current;
  readings.alarmActive = current.length > 0;
  if (previous === undefined) return;

  for (const alarm of active) {
    if (!previous.includes(alarm.instance)) {
      events.push({ type: 'alarm_raised', tokens: alarmTokens(alarm), state: {} });
    }
  }
  for (const alarm of UNIT_ALARMS) {
    if (previous.includes(alarm.instance) && !current.includes(alarm.instance)) {
      events.push({ type: 'alarm_cleared', tokens: alarmTokens(alarm), state: {} });
    }
  }
}

function observeFlag(
  readings: UnitReadings,
  change: {
    key: 'deicingActive' | 'heating';
    value: boolean | undefined;
    types: readonly [UnitEventType, UnitEventType];
  },
  events: UnitEventPayload[],
) {
  const { key, value, types } = change;
  if (value === undefined) return;
  const previous = readings[key];
  readings[key] = value;
  if (previous === undefined || previous === value) return;
  events.push({ type: value ? types[0] : types[1], tokens: {}, state: {} });
}

function observeUptime(readings: UnitReadings, value: number | undefined, events: UnitEventPayload[]) {
  if (value === undefined || !Number.isFinite(value)) return;
  const previous = readings.uptimeMinutes;
  readings.uptimeMinutes = value;
  // Allow a minute of jitter so a counter that is read twice in the same minute is not a restart.
  if (previous !== undefined && value < previous - 1) {
    events.push({ type: 'unit_restarted', tokens: { uptime_minutes: Math.round(value) }, state: {} });
  }
}

/**
 * Updates the remembered readings and returns the flow events the new snapshot causes. The first
 * observation of a value only initializes it, so an app restart does not replay events.
 */
export function observeUnitReadings(readings: UnitReadings, snapshot: UnitReadingSnapshot): UnitEventPayload[] {
  const events: UnitEventPayload[] = [];
  observeAlarms(readings, snapshot.activeAlarms, events);
  observeFlag(readings, {
    key: 'deicingActive',
    value: snapshot.deicingActive,
    types: ['deicing_started', 'deicing_stopped'],
  }, events);
  const heating = snapshot.heatingCoilOutput === undefined || !Number.isFinite(snapshot.heatingCoilOutput)
    ? undefined
    : snapshot.heatingCoilOutput > 0;
  observeFlag(readings, {
    key: 'heating',
    value: heating,
    types: ['heating_coil_started_heating', 'heating_coil_stopped_heating'],
  }, events);
  observeUptime(readings, snapshot.uptimeMinutes, events);

  for (const { key, type, token } of ROUNDED_READINGS) {
    const value = snapshot[key];
    if (value === undefined || !Number.isFinite(value)) continue;
    const rounded = Math.round(value);
    const previous = readings[key];
    readings[key] = rounded;
    if (previous === undefined || previous === rounded) continue;
    events.push({ type, tokens: { [token]: rounded }, state: { previous, current: rounded } });
  }
  return events;
}

export type UnitReadingName =
  | 'alarm_active'
  | 'deicing_active'
  | 'heating'
  | 'filter_life'
  | 'heat_recovery_efficiency';

export function readUnitReading(
  readings: UnitReadings | undefined,
  name: UnitReadingName,
): number | boolean | undefined {
  switch (name) {
    case 'alarm_active':
      return readings?.alarmActive;
    case 'deicing_active':
      return readings?.deicingActive;
    case 'heating':
      return readings?.heating;
    case 'filter_life':
      return readings?.filterLife;
    case 'heat_recovery_efficiency':
      return readings?.heatRecoveryEfficiency;
    default:
      return undefined;
  }
}
