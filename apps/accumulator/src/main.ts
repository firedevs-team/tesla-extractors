import accumulators from './accumulators';

const run = async () => {
  // Espera un segundo para que los logs
  // salgan despues del warning de openai
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log('=======================');
  for (const accumulator of accumulators) {
    await accumulator.run();
  }
};

run();
