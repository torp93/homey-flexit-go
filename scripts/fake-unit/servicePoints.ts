import type { ValueKind } from './manifest';

/**
 * Service menu, operating hours, live reading and alarm points probed on a real Nordic unit on
 * 2026-09-12. Kept as plain data so manifest.ts can build them without an evaluation-time import
 * cycle. Values are the ones the real unit reported.
 */
export interface ServicePointSpec {
  key: string;
  typeName: 'ANALOG_VALUE' | 'BINARY_VALUE';
  instance: number;
  kind: ValueKind;
  access: 'R' | 'RW';
  description: string;
  value?: number;
  opts?: { min?: number; max?: number; units?: string; requiresPriority13?: boolean };
}

function reading(key: string, instance: number, description: string, value: number, units?: string): ServicePointSpec {
  return {
    key, typeName: 'ANALOG_VALUE', instance, kind: 'real', access: 'R', description, value, opts: { units },
  };
}

function setting(
  key: string,
  instance: number,
  description: string,
  value: number,
  range: { min: number; max: number; units: string },
): ServicePointSpec {
  return {
    key,
    typeName: 'ANALOG_VALUE',
    instance,
    kind: 'real',
    access: 'RW',
    description,
    value,
    opts: { ...range, requiresPriority13: true },
  };
}

function alarm(instance: number, description: string): ServicePointSpec {
  return {
    key: `alarm_${instance}`,
    typeName: 'BINARY_VALUE',
    instance,
    kind: 'enum',
    access: 'R',
    description,
    value: 0,
    opts: { min: 0, max: 1 },
  };
}

const ALARM_SPECS: ServicePointSpec[] = [
  alarm(11, 'Fire alarm'),
  alarm(430, 'Fire damper, alarm'),
  alarm(431, 'Duct air temperature fire alarm'),
  ...[
    [495, 'Emergency off activated'], [496, 'Smoke detector tripped'], [497, 'CO detector tripped'],
    [498, 'Fire alarm activated'], [499, 'Fire damper, position feedback fault'],
    [500, 'Supply air temp., operat.limits exceeded'], [501, 'Supply air temperature, sensor fault'],
    [502, 'Frost prot.temp.heat.coil, sensor fault'], [503, 'Supply air fan, speed feedback fault'],
    [504, 'Exhaust air fan, speed feedback fault'], [505, 'Heating coil, frost warning'],
    [506, 'Reheating coil zone, overtemperature'], [507, 'Heating coil, overtemperature'],
    [508, 'Reheating coil zone, frost warning'], [509, 'Heat pump air damper stops air flow'],
    [510, 'Frost prot.temp.reheat.zone,sensor fault'], [511, 'Outside air temperature, sensor fault'],
    [512, 'Rotary heat exchanger, motor stuck'], [513, 'Rotary heat exchanger, belt broken'],
    [514, 'Heat pump, common alarm'], [515, 'Heat pump controller, Modbus comm.error'],
    [516, 'I/O exten.module 1, Modbus comm.error'], [517, 'I/O exten.module 2, Modbus comm.error'],
    [518, 'Diff.pressure sensor, Modbus comm.error'], [519, 'Exhaust air temperature, sensor fault'],
    [520, 'Extract air temperature, sensor fault'], [521, 'Rel.humidity extract air, sensor fault'],
    [522, 'Air filter polluted'], [523, 'Zone supply air temp., sensor fault'],
    [524, 'Supply air pressure, sensor fault'], [525, 'Extract air pressure, sensor fault'],
    [526, 'Diff.press.supply air fan, sensor fault'], [527, 'Diff.press.exhaust air fan, sensor fault'],
    [528, 'RF interface device, Modbus comm.error'], [529, 'RF communication error'],
    [530, 'RF device, battery low'], [580, 'Outside air damper stops air flow'],
    [587, 'Rotary heat exch. motor short circuit'], [634, 'Heat exchange. lose control'],
    [635, 'Heating coil, lose control'], [642, 'Device warm restart'],
  ].map(([instance, description]) => alarm(instance as number, description as string)),
];

export const SERVICE_POINT_SPECS: ServicePointSpec[] = [
  reading('heat_recovery_efficiency', 2023, 'Rotating heat exchanger, efficiency', 60.27, '%'),
  reading('supply_air_setpoint_present', 132, 'Present setpoint supply temperature', 19.5, 'degC'),
  reading('heating_coil_request', 196, 'Heating coil heating request', 34.09, '%'),
  reading('heating_coil_nominal_power', 190, 'Electric heater, nom. Power', 0.8, 'kW'),
  reading('fan_speed_min', 2091, 'Fan speed, min', 30, '%'),
  reading('system_run_time_minutes', 2361, 'DevSysRunTm_Min', 153, 'min'),
  setting('winter_compensation', 107, 'Heating, setpoint for shift', 2, { min: -10, max: 10, units: 'K' }),
  setting('winter_compensation_start', 106, 'Heating, setpoint start value shift', -5, {
    min: -40, max: 10, units: 'degC',
  }),
  setting('winter_compensation_end', 102, 'Heating, setpoint end value shift', -15, {
    min: -40, max: 10, units: 'degC',
  }),
  setting('summer_compensation', 79, 'Cooling, setpoint for shift', -3, { min: -10, max: 10, units: 'K' }),
  setting('summer_compensation_start', 78, 'Cooling setpoint start value shift', 20, {
    min: 0, max: 40, units: 'degC',
  }),
  setting('summer_compensation_end', 75, 'Cooling, setpoint end value shift', 28, { min: 0, max: 40, units: 'degC' }),
  reading('operating_hours_total', 1847, 'Operating hours, total time', 29232, 'h'),
  reading('operating_hours_stop', 1913, 'Time counter, STOP', 0, 'h'),
  reading('operating_hours_away', 1914, 'Time counter, AWAY', 1712, 'h'),
  reading('operating_hours_home', 1915, 'Time counter, HOME', 24168, 'h'),
  reading('operating_hours_high', 1916, 'Time counter, HIGH', 3324, 'h'),
  reading('operating_hours_fireplace', 1814, 'Time counter, FIRE', 36, 'h'),
  reading('operating_hours_cooker_hood', 1820, 'Time counter, cooker hood', 0, 'h'),
  reading('operating_hours_heat_exchanger', 1851, 'Time counter, op. time RMC', 20940, 'h'),
  reading('operating_hours_electric_heater', 1879, 'Time counter, op. time - El. heater', 9924, 'h'),
  reading('alarm_code_a', 1794, 'Present A-Alarm code', 0),
  reading('alarm_code_b', 1846, 'Present B-Alarm code', 0),
  ...ALARM_SPECS,
];
