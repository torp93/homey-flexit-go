import sinon from 'sinon';
import { afterEach, describe, expect, it } from 'vitest';
import { createFlexitAppClass } from '../lib/createAppClass';
import { findStructuredLog } from './logging_test_utils';

class MockHomeyApp {
  homey: any;
  log = sinon.stub();
  error = sinon.stub();

  constructor() {
    this.homey = {
      flow: {
        getActionCard: sinon.stub().returns({
          registerRunListener: sinon.stub(),
        }),
        getConditionCard: sinon.stub().returns({
          registerRunListener: sinon.stub(),
        }),
        getDeviceTriggerCard: sinon.stub().returns({
          trigger: sinon.stub().resolves(),
          registerRunListener: sinon.stub(),
        }),
      },
      drivers: {
        getDriver: sinon.stub().throws(new Error('Driver not found')),
      },
    };
  }
}

function createRegistryStub(overrides: Record<string, any> = {}) {
  return {
    setLogger: sinon.stub(),
    setFanSetpointChangedHandler: sinon.stub(),
    setDehumidificationStateChangedHandler: sinon.stub(),
    setFreeCoolingStateChangedHandler: sinon.stub(),
    setVentilationStoppedStateChangedHandler: sinon.stub(),
    setHeatingCoilStateChangedHandler: sinon.stub(),
    setFanProfileMode: sinon.stub().resolves(),
    setFireplaceVentilationDuration: sinon.stub().resolves(),
    setRapidVentilationDuration: sinon.stub().resolves(),
    activateTemporaryHigh: sinon.stub().resolves(),
    stopVentilation: sinon.stub().resolves(),
    getDehumidificationActive: sinon.stub().resolves(true),
    getFreeCoolingActive: sinon.stub().resolves(true),
    getVentilationStopped: sinon.stub().resolves(true),
    getModeWidgetSnapshot: sinon.stub().returns({
      unitId: 'unit-1',
      transport: 'bacnet',
      available: true,
      stale: false,
      fanMode: 'home',
      fanModeLabel: 'Home',
      fanModeDetail: 'Normal fan profile',
      modes: [],
      readings: [],
    }),
    setHeatingCoilEnabled: sinon.stub().resolves(),
    toggleHeatingCoilEnabled: sinon.stub().resolves(true),
    getHeatingCoilEnabled: sinon.stub().resolves(true),
    setFreeCoolingEnabled: sinon.stub().resolves(),
    setFreeCoolingTemperatureSetpoint: sinon.stub().resolves(),
    setFreeCoolingOutsideTemperatureLimit: sinon.stub().resolves(),
    setUnitEventHandler: sinon.stub(),
    getUnitReading: sinon.stub().resolves(0),
    setTemperatureSetpoint: sinon.stub().resolves(),
    setUnitNumericSetting: sinon.stub().resolves(),
    setFreeCoolingDtStart: sinon.stub().resolves(),
    setFreeCoolingDtStop: sinon.stub().resolves(),
    setDeicingEnabled: sinon.stub().resolves(),
    resetFilterTimer: sinon.stub().resolves(),
    setFilterChangeIntervalMonths: sinon.stub().resolves(),
    ...overrides,
  };
}

/** Hands out one stub card per id, so tests can reach any card the app registers. */
function wireCardsById(app: any) {
  const byId = new Map<string, any>();
  const cardFor = (id: string, create: () => any) => {
    if (!byId.has(id)) byId.set(id, create());
    return byId.get(id);
  };
  app.homey.flow.getDeviceTriggerCard.callsFake((id: string) => cardFor(id, () => ({
    trigger: sinon.stub().resolves(),
    registerRunListener: sinon.stub(),
  })));
  app.homey.flow.getConditionCard.callsFake((id: string) => cardFor(id, () => ({ registerRunListener: sinon.stub() })));
  app.homey.flow.getActionCard.callsFake((id: string) => cardFor(id, () => ({ registerRunListener: sinon.stub() })));
  return byId;
}

function createAppClass(registryStub: Record<string, any>, normalizeFanProfilePercent?: (...args: any[]) => number) {
  return createFlexitAppClass({
    HomeyApp: MockHomeyApp,
    registry: registryStub,
    isFanProfileMode: (mode: unknown) => ['home', 'away', 'high', 'fireplace', 'cooker'].includes(String(mode)),
    normalizeFanProfilePercent: normalizeFanProfilePercent ?? ((value: number) => Math.round(value)),
    normalizeFireplaceDurationMinutes: (value: unknown) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        throw new Error('Fireplace duration must be numeric');
      }
      const rounded = Math.round(numeric);
      if (rounded < 1 || rounded > 360) {
        throw new Error('Fireplace duration must be between 1 and 360 minutes');
      }
      return rounded;
    },
    normalizeHighDurationMinutes: (value: unknown) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        throw new Error('High duration must be numeric');
      }
      const rounded = Math.round(numeric);
      if (rounded < 0 || rounded > 360) {
        throw new Error('High duration must be between 0 and 360 minutes');
      }
      return rounded;
    },
    installSourceMapSupport: sinon.stub(),
  });
}

function createCards() {
  return {
    action: {
      setFanProfileMode: { registerRunListener: sinon.stub() },
      setFireplaceDuration: { registerRunListener: sinon.stub() },
      setHighDuration: { registerRunListener: sinon.stub() },
      activateTemporaryHigh: { registerRunListener: sinon.stub() },
      stopVentilation: { registerRunListener: sinon.stub() },
      turnHeatingCoilOn: { registerRunListener: sinon.stub() },
      turnHeatingCoilOff: { registerRunListener: sinon.stub() },
      toggleHeatingCoilOnOff: { registerRunListener: sinon.stub() },
      turnFreeCoolingOn: { registerRunListener: sinon.stub() },
      turnFreeCoolingOff: { registerRunListener: sinon.stub() },
      setFreeCoolingSetpoint: { registerRunListener: sinon.stub() },
      setFreeCoolingOutsideLimit: { registerRunListener: sinon.stub() },
    },
    condition: {
      dehumidificationIsActive: { registerRunListener: sinon.stub() },
      freeCoolingIsActive: { registerRunListener: sinon.stub() },
      ventilationIsStopped: { registerRunListener: sinon.stub() },
      heatingCoilIsOn: { registerRunListener: sinon.stub() },
    },
    trigger: {
      dehumidificationActivated: { trigger: sinon.stub().resolves() },
      dehumidificationDeactivated: { trigger: sinon.stub().resolves() },
      freeCoolingActivated: { trigger: sinon.stub().resolves() },
      freeCoolingDeactivated: { trigger: sinon.stub().resolves() },
      ventilationStopped: { trigger: sinon.stub().resolves() },
      ventilationResumed: { trigger: sinon.stub().resolves() },
      supplyFanSetpointChanged: { trigger: sinon.stub().resolves() },
      extractFanSetpointChanged: { trigger: sinon.stub().resolves() },
      heatingCoilTurnedOn: { trigger: sinon.stub().resolves() },
      heatingCoilTurnedOff: { trigger: sinon.stub().resolves() },
    },
  };
}

function wireCards(app: any, cards: ReturnType<typeof createCards>) {
  app.homey.flow.getActionCard.withArgs('set_fan_profile_mode').returns(cards.action.setFanProfileMode);
  app.homey.flow.getActionCard.withArgs('set_fireplace_duration').returns(cards.action.setFireplaceDuration);
  app.homey.flow.getActionCard.withArgs('set_high_duration').returns(cards.action.setHighDuration);
  app.homey.flow.getActionCard.withArgs('activate_temporary_high').returns(cards.action.activateTemporaryHigh);
  app.homey.flow.getActionCard.withArgs('stop_ventilation').returns(cards.action.stopVentilation);
  app.homey.flow.getActionCard.withArgs('turn_heating_coil_on').returns(cards.action.turnHeatingCoilOn);
  app.homey.flow.getActionCard.withArgs('turn_heating_coil_off').returns(cards.action.turnHeatingCoilOff);
  app.homey.flow.getActionCard.withArgs('toggle_heating_coil_onoff').returns(cards.action.toggleHeatingCoilOnOff);
  app.homey.flow.getActionCard.withArgs('turn_free_cooling_on').returns(cards.action.turnFreeCoolingOn);
  app.homey.flow.getActionCard.withArgs('turn_free_cooling_off').returns(cards.action.turnFreeCoolingOff);
  app.homey.flow.getActionCard.withArgs('set_free_cooling_setpoint').returns(cards.action.setFreeCoolingSetpoint);
  app.homey.flow.getActionCard.withArgs('set_free_cooling_outside_limit')
    .returns(cards.action.setFreeCoolingOutsideLimit);

  app.homey.flow.getConditionCard.withArgs('dehumidification_is_active')
    .returns(cards.condition.dehumidificationIsActive);
  app.homey.flow.getConditionCard.withArgs('free_cooling_is_active')
    .returns(cards.condition.freeCoolingIsActive);
  app.homey.flow.getConditionCard.withArgs('ventilation_is_stopped')
    .returns(cards.condition.ventilationIsStopped);
  app.homey.flow.getConditionCard.withArgs('heating_coil_is_on').returns(cards.condition.heatingCoilIsOn);

  app.homey.flow.getDeviceTriggerCard.withArgs('dehumidification_activated')
    .returns(cards.trigger.dehumidificationActivated);
  app.homey.flow.getDeviceTriggerCard.withArgs('dehumidification_deactivated')
    .returns(cards.trigger.dehumidificationDeactivated);
  app.homey.flow.getDeviceTriggerCard.withArgs('free_cooling_activated')
    .returns(cards.trigger.freeCoolingActivated);
  app.homey.flow.getDeviceTriggerCard.withArgs('free_cooling_deactivated')
    .returns(cards.trigger.freeCoolingDeactivated);
  app.homey.flow.getDeviceTriggerCard.withArgs('ventilation_stopped')
    .returns(cards.trigger.ventilationStopped);
  app.homey.flow.getDeviceTriggerCard.withArgs('ventilation_resumed')
    .returns(cards.trigger.ventilationResumed);
  app.homey.flow.getDeviceTriggerCard.withArgs('supply_fan_setpoint_changed')
    .returns(cards.trigger.supplyFanSetpointChanged);
  app.homey.flow.getDeviceTriggerCard.withArgs('extract_fan_setpoint_changed')
    .returns(cards.trigger.extractFanSetpointChanged);
  app.homey.flow.getDeviceTriggerCard.withArgs('heating_coil_turned_on').returns(cards.trigger.heatingCoilTurnedOn);
  app.homey.flow.getDeviceTriggerCard.withArgs('heating_coil_turned_off').returns(cards.trigger.heatingCoilTurnedOff);
}

describe('App flow registration (vitest)', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('registers dehumidification, free-cooling, and heating-coil flow cards and forwards callbacks', async () => {
    const registryStub = createRegistryStub();
    const cards = createCards();
    const AppClass = createAppClass(registryStub);
    const app = new AppClass();
    wireCards(app, cards);

    await app.onInit();

    expect(app.homey.flow.getActionCard.calledWithExactly('set_fan_profile_mode')).toBe(true);
    expect(app.homey.flow.getConditionCard.calledWithExactly('dehumidification_is_active')).toBe(true);
    expect(app.homey.flow.getDeviceTriggerCard.calledWithExactly('dehumidification_activated')).toBe(true);
    expect(registryStub.setFanSetpointChangedHandler.calledOnce).toBe(true);

    const fanProfileListener = cards.action.setFanProfileMode.registerRunListener.firstCall.args[0];
    const fanProfileResult = await fanProfileListener({
      device: { getData: () => ({ unitId: 'unit-1' }) },
      mode: 'home',
      supply_percent: 70,
      exhaust_percent: 60,
    });

    expect(fanProfileResult).toBe(true);
    expect(registryStub.setFanProfileMode.calledOnceWithExactly('unit-1', 'home', 70, 60)).toBe(true);
  });

  it('forwards the set high duration flow card to the registry', async () => {
    const registryStub = createRegistryStub();
    const cards = createCards();
    const AppClass = createAppClass(registryStub);
    const app = new AppClass();
    wireCards(app, cards);

    await app.onInit();

    expect(app.homey.flow.getActionCard.calledWithExactly('set_high_duration')).toBe(true);

    const highDurationListener = cards.action.setHighDuration.registerRunListener.firstCall.args[0];
    const result = await highDurationListener({
      device: { getData: () => ({ unitId: 'unit-1' }) },
      minutes: 60,
    });

    expect(result).toBe(true);
    expect(registryStub.setRapidVentilationDuration.calledOnceWithExactly('unit-1', 60)).toBe(true);
  });

  it('forwards the activate temporary high flow card to the registry', async () => {
    const registryStub = createRegistryStub();
    const cards = createCards();
    const AppClass = createAppClass(registryStub);
    const app = new AppClass();
    wireCards(app, cards);

    await app.onInit();

    expect(app.homey.flow.getActionCard.calledWithExactly('activate_temporary_high')).toBe(true);

    const temporaryHighListener = cards.action.activateTemporaryHigh.registerRunListener.firstCall.args[0];
    const result = await temporaryHighListener({
      device: { getData: () => ({ unitId: 'unit-1' }) },
    });

    expect(result).toBe(true);
    expect(registryStub.activateTemporaryHigh.calledOnceWithExactly('unit-1')).toBe(true);
  });

  it('forwards the free cooling on and off flow cards to the registry', async () => {
    const registryStub = createRegistryStub();
    const cards = createCards();
    const AppClass = createAppClass(registryStub);
    const app = new AppClass();
    wireCards(app, cards);

    await app.onInit();

    expect(app.homey.flow.getActionCard.calledWithExactly('turn_free_cooling_on')).toBe(true);
    expect(app.homey.flow.getActionCard.calledWithExactly('turn_free_cooling_off')).toBe(true);

    const device = { getData: () => ({ unitId: 'unit-1' }) };
    const onListener = cards.action.turnFreeCoolingOn.registerRunListener.firstCall.args[0];
    const offListener = cards.action.turnFreeCoolingOff.registerRunListener.firstCall.args[0];

    expect(await onListener({ device })).toBe(true);
    expect(registryStub.setFreeCoolingEnabled.calledOnceWithExactly('unit-1', true)).toBe(true);

    expect(await offListener({ device })).toBe(true);
    expect(registryStub.setFreeCoolingEnabled.secondCall.args).toEqual(['unit-1', false]);
  });

  it('rejects the free cooling flow cards when the device has no unit id', async () => {
    const registryStub = createRegistryStub();
    const cards = createCards();
    const AppClass = createAppClass(registryStub);
    const app = new AppClass();
    wireCards(app, cards);

    await app.onInit();

    const onListener = cards.action.turnFreeCoolingOn.registerRunListener.firstCall.args[0];
    await expect(onListener({ device: { getData: () => ({}) } })).rejects.toThrow('Device unitId is missing.');
    expect(registryStub.setFreeCoolingEnabled.called).toBe(false);
  });

  it('forwards the free cooling setpoint and outdoor limit flow cards to the registry', async () => {
    const registryStub = createRegistryStub();
    const cards = createCards();
    const AppClass = createAppClass(registryStub);
    const app = new AppClass();
    wireCards(app, cards);

    await app.onInit();

    expect(app.homey.flow.getActionCard.calledWithExactly('set_free_cooling_setpoint')).toBe(true);
    expect(app.homey.flow.getActionCard.calledWithExactly('set_free_cooling_outside_limit')).toBe(true);

    const device = { getData: () => ({ unitId: 'unit-1' }) };
    const setpointListener = cards.action.setFreeCoolingSetpoint.registerRunListener.firstCall.args[0];
    const outsideLimitListener = cards.action.setFreeCoolingOutsideLimit.registerRunListener.firstCall.args[0];

    expect(await setpointListener({ device, temperature: 21 })).toBe(true);
    expect(registryStub.setFreeCoolingTemperatureSetpoint.calledOnceWithExactly('unit-1', 21)).toBe(true);

    expect(await outsideLimitListener({ device, temperature: 12.5 })).toBe(true);
    expect(registryStub.setFreeCoolingOutsideTemperatureLimit.calledOnceWithExactly('unit-1', 12.5)).toBe(true);
  });

  it('propagates registry errors from the free cooling setpoint flow card', async () => {
    const registryStub = createRegistryStub({
      setFreeCoolingTemperatureSetpoint: sinon.stub().rejects(
        new Error('Free cooling temperature must be between 10 and 30 degC'),
      ),
    });
    const cards = createCards();
    const AppClass = createAppClass(registryStub);
    const app = new AppClass();
    wireCards(app, cards);

    await app.onInit();

    const setpointListener = cards.action.setFreeCoolingSetpoint.registerRunListener.firstCall.args[0];
    await expect(setpointListener({
      device: { getData: () => ({ unitId: 'unit-1' }) },
      temperature: 35,
    })).rejects.toThrow('between 10 and 30');
  });

  it('forwards unit events to the matching trigger cards with tokens and state', async () => {
    const registryStub = createRegistryStub();
    const AppClass = createAppClass(registryStub);
    const app = new AppClass();
    const cards = wireCardsById(app);
    await app.onInit();

    const handler = registryStub.setUnitEventHandler.firstCall.args[0];
    const device = { getData: () => ({ unitId: 'unit-1' }) };
    handler({ device, type: 'alarm_raised', tokens: { alarm: 'Air filter polluted', code: '1020' }, state: {} });
    handler({ device, type: 'filter_life_changed', tokens: { filter_life: 29 }, state: { previous: 30, current: 29 } });

    expect(cards.get('alarm_raised').trigger.calledOnceWithExactly(
      device, { alarm: 'Air filter polluted', code: '1020' }, {},
    )).toBe(true);
    expect(cards.get('filter_life_changed').trigger.calledOnce).toBe(true);
    expect(cards.get('filter_life_dropped_below').trigger.calledOnceWithExactly(
      device, { filter_life: 29 }, { previous: 30, current: 29 },
    )).toBe(true);
    expect(cards.get('alarm_cleared').trigger.called).toBe(false);
  });

  it('only runs the filter life dropped below trigger when the level is crossed', async () => {
    const registryStub = createRegistryStub();
    const AppClass = createAppClass(registryStub);
    const app = new AppClass();
    const cards = wireCardsById(app);
    await app.onInit();

    const listener = cards.get('filter_life_dropped_below').registerRunListener.firstCall.args[0];
    expect(await listener({ percent: 30 }, { previous: 30, current: 29 })).toBe(true);
    expect(await listener({ percent: 30 }, { previous: 29, current: 28 })).toBe(false);
    expect(await listener({ percent: 20 }, { previous: 30, current: 29 })).toBe(false);
  });

  it('answers the unit condition cards from registry readings', async () => {
    const readings: Record<string, unknown> = {
      alarm_active: true,
      deicing_active: false,
      heating: true,
      filter_life: 25,
      heat_recovery_efficiency: 70,
    };
    const registryStub = createRegistryStub({
      getUnitReading: sinon.stub().callsFake(async (_unitId: string, reading: string) => readings[reading]),
    });
    const AppClass = createAppClass(registryStub);
    const app = new AppClass();
    const cards = wireCardsById(app);
    await app.onInit();

    const device = { getData: () => ({ unitId: 'unit-1' }) };
    const run = (id: string, args: Record<string, unknown> = {}) => (
      cards.get(id).registerRunListener.firstCall.args[0]({ device, ...args })
    );
    expect(await run('unit_alarm_is_active')).toBe(true);
    expect(await run('deicing_is_active')).toBe(false);
    expect(await run('heating_coil_is_heating')).toBe(true);
    expect(await run('filter_life_is_below', { percent: 30 })).toBe(true);
    expect(await run('heat_recovery_efficiency_is_below', { percent: 60 })).toBe(false);
    expect(registryStub.getUnitReading.calledWithExactly('unit-1', 'filter_life')).toBe(true);
  });

  it('forwards the unit action cards to the registry', async () => {
    const registryStub = createRegistryStub();
    const AppClass = createAppClass(registryStub);
    const app = new AppClass();
    const cards = wireCardsById(app);
    await app.onInit();

    const device = { getData: () => ({ unitId: 'unit-1' }), getSetting: sinon.stub().returns(undefined) };
    const run = (id: string, args: Record<string, unknown> = {}) => (
      cards.get(id).registerRunListener.firstCall.args[0]({ device, ...args })
    );
    expect(await run('set_supply_air_setpoint_mode', { mode: 'away', temperature: 19 })).toBe(true);
    expect(await run('set_heating_neutral_zone', { mode: 'home', kelvin: 3 })).toBe(true);
    expect(await run('set_outdoor_compensation', { setting: 'summer_compensation_k', value: -2 })).toBe(true);
    expect(await run('set_free_cooling_dt', { threshold: 'stop', kelvin: 1 })).toBe(true);
    expect(await run('set_deicing_enabled', { state: 'off' })).toBe(true);
    expect(await run('reset_filter_timer')).toBe(true);
    expect(await run('set_filter_change_interval', { months: 6 })).toBe(true);

    expect(registryStub.setTemperatureSetpoint.calledOnceWithExactly('unit-1', 'away', 19)).toBe(true);
    expect(registryStub.setUnitNumericSetting.calledWithExactly('unit-1', 'heating_neutral_zone_home_k', 3)).toBe(true);
    expect(registryStub.setUnitNumericSetting.calledWithExactly('unit-1', 'summer_compensation_k', -2)).toBe(true);
    expect(registryStub.setFreeCoolingDtStop.calledOnceWithExactly('unit-1', 1)).toBe(true);
    expect(registryStub.setDeicingEnabled.calledOnceWithExactly('unit-1', false)).toBe(true);
    expect(registryStub.resetFilterTimer.calledOnceWithExactly('unit-1')).toBe(true);
    expect(registryStub.setFilterChangeIntervalMonths.calledOnceWithExactly('unit-1', 6)).toBe(true);
  });

  it('rejects unit action cards with an invalid mode or an inverted free cooling difference', async () => {
    const registryStub = createRegistryStub();
    const AppClass = createAppClass(registryStub);
    const app = new AppClass();
    const cards = wireCardsById(app);
    await app.onInit();

    const getSetting = sinon.stub();
    getSetting.withArgs('free_cooling_dt_start_k').returns(1.5);
    const device = { getData: () => ({ unitId: 'unit-1' }), getSetting };
    const run = (id: string, args: Record<string, unknown> = {}) => (
      cards.get(id).registerRunListener.firstCall.args[0]({ device, ...args })
    );
    await expect(run('set_supply_air_setpoint_mode', { mode: 'high', temperature: 19 }))
      .rejects.toThrow('Mode must be home or away.');
    await expect(run('set_free_cooling_dt', { threshold: 'stop', kelvin: 1.5 }))
      .rejects.toThrow('must be lower than the start temperature difference');
    await expect(run('set_free_cooling_dt', { threshold: 'sideways', kelvin: 1 }))
      .rejects.toThrow('Threshold must be start or stop.');
    expect(registryStub.setTemperatureSetpoint.called).toBe(false);
    expect(registryStub.setFreeCoolingDtStop.called).toBe(false);
  });

  it('returns ventilation mode widget status for the selected Homey device', () => {
    const registryStub = createRegistryStub();
    const AppClass = createAppClass(registryStub);
    const app = new AppClass();
    const device = {
      getId: sinon.stub().returns('homey-device-1'),
      getName: sinon.stub().returns('Kitchen ventilation'),
      getAvailable: sinon.stub().returns(true),
      getData: sinon.stub().returns({ id: 'unit-1', unitId: 'unit-1' }),
      driver: { id: 'nordic' },
    };

    app.homey.drivers.getDriver.withArgs('nordic').returns({
      getDevices: sinon.stub().returns([device]),
    });

    const status = (app as any).getVentilationModesWidgetStatus('homey-device-1');

    expect(status.state).toBe('ready');
    expect(status.device.name).toBe('Kitchen ventilation');
    expect(status.device.unitId).toBe('unit-1');
    expect(status.fanModeLabel).toBe('Home');
    expect(registryStub.getModeWidgetSnapshot.calledOnceWithExactly('unit-1')).toBe(true);
  });

  it('returns unavailable widget status when the selected device has no unit id', () => {
    const registryStub = createRegistryStub();
    const AppClass = createAppClass(registryStub);
    const app = new AppClass();
    const device = {
      getId: sinon.stub().returns('homey-device-1'),
      getName: sinon.stub().returns('Incomplete ventilation'),
      getData: sinon.stub().returns({}),
    };

    app.homey.drivers.getDriver.withArgs('nordic').returns({
      getDevices: sinon.stub().returns([device]),
    });

    const status = (app as any).getVentilationModesWidgetStatus('homey-device-1');

    expect(status.state).toBe('unavailable');
    expect(status.message).toBe('Ventilation status is not available yet.');
    expect(registryStub.getModeWidgetSnapshot.called).toBe(false);
  });

  it('logs uncaughtException and unhandledRejection through global handlers', async () => {
    const registryStub = createRegistryStub();
    const AppClass = createAppClass(registryStub);
    const processOnStub = sinon.stub(process, 'on');
    const app = new AppClass();

    await app.onInit();

    const uncaughtHandler = processOnStub.withArgs('uncaughtException').firstCall.args[1];
    const rejectionHandler = processOnStub.withArgs('unhandledRejection').firstCall.args[1];
    const uncaught = new Error('uncaught');
    const rejection = new Error('rejection');

    uncaughtHandler(uncaught);
    rejectionHandler(rejection, Promise.resolve());

    const uncaughtLog = findStructuredLog(app.error, 'app.process.uncaught_exception');
    const rejectionLog = findStructuredLog(app.error, 'app.process.unhandled_rejection');
    expect(uncaughtLog?.msg).toBe('Unhandled process exception');
    expect(uncaughtLog?.error?.message).toBe('uncaught');
    expect(rejectionLog?.msg).toBe('Unhandled promise rejection');
    expect(rejectionLog?.error?.message).toBe('rejection');
  });
});
