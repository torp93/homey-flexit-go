import type { RuntimeLogger } from './logging';

/** Capabilities introduced after the first release; devices paired earlier get them on init. */
export const REQUIRED_CAPABILITIES = [
  'measure_temperature.supply',
  'measure_temperature.exhaust',
  'measure_supply_air_setpoint_present',
  'measure_heat_recovery_efficiency',
  'measure_heat_exchanger_percent',
  'measure_heating_coil_output_percent',
  'measure_heating_coil_demand_percent',
  'unit_alarm_active',
  'dehumidification_active',
  'free_cooling_active',
  'deicing_active',
  'ventilation_stopped',
  'button.reset_filter',
  'measure_fan_setpoint_percent',
  'measure_fan_setpoint_percent.extract',
  'measure_filter_life_percent',
  'measure_free_cooling_active',
  'measure_dehumidification_active',
  'measure_ventilation_stopped',
  'measure_deicing_active',
  'measure_unit_alarm_active',
  'measure_heating_coil_hours',
  'measure_unit_uptime',
] as const;

/**
 * Capabilities the app no longer uses. measure_hepa_filter never received Insights data and is
 * replaced by measure_filter_life_percent; measure_humidity has no sensor on these units.
 */
export const OBSOLETE_CAPABILITIES = ['measure_hepa_filter', 'measure_humidity'] as const;

export const CAPABILITY_ORDER_ATTEMPT_STORE_KEY = 'capabilityOrderAttempt';

/**
 * Bump when capability definitions change in a way existing devices must pick up, such as icons.
 * Homey snapshots a capability's icon and title when the capability is added to a device, so a
 * changed definition only reaches an existing device through a rebuild.
 */
export const CAPABILITY_DEFINITIONS_VERSION = '2026-09-12-fill-icons';
export const CAPABILITY_DEFINITIONS_STORE_KEY = 'capabilityDefinitionsVersion';

export interface MigratableDevice {
  hasCapability(capability: string): boolean;
  addCapability(capability: string): Promise<void>;
  removeCapability?: (capability: string) => Promise<void>;
  getCapabilities?: () => string[];
  getStoreValue?: (key: string) => unknown;
  setStoreValue?: (key: string, value: unknown) => Promise<void>;
}

async function addMissingCapabilities(device: MigratableDevice, logger: RuntimeLogger) {
  for (const capability of REQUIRED_CAPABILITIES) {
    if (device.hasCapability(capability)) continue;
    try {
      await device.addCapability(capability);
      logger.info('device.capability.added', 'Added missing capability', { capability });
    } catch (e) {
      logger.error('device.capability.add.failed', 'Failed to add missing capability', e, { capability });
    }
  }
}

async function removeObsoleteCapabilities(device: MigratableDevice, logger: RuntimeLogger) {
  if (typeof device.removeCapability !== 'function') return;
  for (const capability of OBSOLETE_CAPABILITIES) {
    if (!device.hasCapability(capability)) continue;
    try {
      await device.removeCapability(capability);
      logger.info('device.capability.removed', 'Removed obsolete capability', { capability });
    } catch (e) {
      logger.error('device.capability.remove.failed', 'Failed to remove obsolete capability', e, { capability });
    }
  }
}

async function rebuildCapabilities(
  device: Required<Pick<MigratableDevice, 'removeCapability' | 'addCapability'>>,
  current: string[],
  wanted: string[],
  logger: RuntimeLogger,
): Promise<boolean> {
  let failed = false;
  for (const capability of current) {
    try {
      await device.removeCapability(capability);
    } catch (e) {
      failed = true;
      logger.error('device.capability.order.remove.failed', 'Failed to remove capability', e, { capability });
    }
  }
  for (const capability of wanted) {
    try {
      await device.addCapability(capability);
    } catch (e) {
      failed = true;
      logger.error('device.capability.order.add.failed', 'Failed to re-add capability', e, { capability });
    }
  }
  return !failed;
}

/**
 * addCapability always appends, so a capability introduced after pairing ends up last on an
 * existing device instead of where the manifest puts it, and the device page shows it there.
 * Homey has no reorder API, and rebuilding only the diverging tail changes the array without
 * moving the page, so every capability is removed and added back in manifest order. Insights
 * history is kept, because logs are keyed on the capability id.
 *
 * Expensive and not atomic, so it only runs when the order is actually wrong. A rebuild that does
 * not take is attempted once per target order; the marker is written last and only when nothing
 * failed, so a rebuild that dies halfway is repaired on the next start.
 */
async function alignCapabilityOrderToManifest(
  device: MigratableDevice,
  declared: unknown,
  logger: RuntimeLogger,
) {
  const { removeCapability, getCapabilities, getStoreValue, setStoreValue } = device;
  if (typeof removeCapability !== 'function' || typeof getCapabilities !== 'function') return;
  if (!Array.isArray(declared)) return;

  const current = getCapabilities.call(device);
  const wanted = declared.filter(
    (capability): capability is string => typeof capability === 'string' && current.includes(capability),
  );
  // Membership is reconciled first; if the lists still differ in content, order is not the issue.
  if (wanted.length !== current.length) return;
  const orderMatches = wanted.join('|') === current.join('|');
  const definitionsCurrent = getStoreValue?.call(device, CAPABILITY_DEFINITIONS_STORE_KEY)
    === CAPABILITY_DEFINITIONS_VERSION;
  if (orderMatches && definitionsCurrent) return;

  const signature = wanted.join(',');
  if (definitionsCurrent && getStoreValue?.call(device, CAPABILITY_ORDER_ATTEMPT_STORE_KEY) === signature) {
    logger.info(
      'device.capability.order.skipped',
      'Capability order still differs from the manifest after a rebuild; not retrying',
      { current },
    );
    return;
  }

  // A definitions change (such as new icons) rebuilds once even when the order is already right.
  logger.info('device.capability.order.rebuild', 'Rebuilding capability order', {
    wanted,
    reason: orderMatches ? 'definitions' : 'order',
  });
  const rebuilt = await rebuildCapabilities({
    removeCapability: removeCapability.bind(device),
    addCapability: device.addCapability.bind(device),
  }, current, wanted, logger);
  if (!rebuilt) return;
  await setStoreValue?.call(device, CAPABILITY_ORDER_ATTEMPT_STORE_KEY, signature);
  await setStoreValue?.call(device, CAPABILITY_DEFINITIONS_STORE_KEY, CAPABILITY_DEFINITIONS_VERSION);
}

/** Adds missing capabilities, removes obsolete ones, then restores the manifest order. */
export async function migrateCapabilities(
  device: MigratableDevice,
  declaredCapabilities: unknown,
  logger: RuntimeLogger,
) {
  await addMissingCapabilities(device, logger);
  await removeObsoleteCapabilities(device, logger);
  await alignCapabilityOrderToManifest(device, declaredCapabilities, logger);
}
