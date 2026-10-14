
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  createObserveModule: vi.fn(),
}));

vi.mock('@nestjs/observe', () => ({
  createObserveModule: mocks.createObserveModule,
}));

describe('Observe module initialization (unit)', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createObserveModule.mockReset();
  });

  it('initializes and exports the Observe module and instrument', async () => {
    const MockObserveModule = class {};
    const MockObserveInstrument = class {};

    mocks.createObserveModule.mockReturnValue({
      ObserveModule: MockObserveModule,
      ObserveInstrument: MockObserveInstrument,
    });

    const observe = await import('./observe.js');

    expect(mocks.createObserveModule).toHaveBeenCalledTimes(1);

    expect(observe.ObserveModule).toBe(MockObserveModule);
    expect(observe.ObserveInstrument).toBe(
      MockObserveInstrument,
    );
  });
});
