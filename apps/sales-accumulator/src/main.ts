import accumulators from './accumulators';

const run = async () => {
  for (const accumulator of accumulators) {
    await accumulator.run();
  }
};

run();
