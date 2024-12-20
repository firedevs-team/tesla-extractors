import { readdir, stat } from 'fs/promises';
import extractors from './extractors';
import generators from './generators';
import { Storage } from '@google-cloud/storage';
import path from 'path';

const DEBUG_EXTRACTOR = process.env['DEBUG_EXTRACTOR'];
const DEBUG_GENERATOR = process.env['DEBUG_GENERATOR'];
let isDebugMode = DEBUG_EXTRACTOR || DEBUG_GENERATOR;

const storage = new Storage();
const bucketName = 'tesla_intelligence';

/**
 * Sube los archivos de un directorio local a un destino en el bucket
 * @param dirPath
 * @param destPath
 */
const uploadFiles = async (dirPath: string, destPath: string) => {
  const files = await readdir(dirPath);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stats = await stat(fullPath);

    if (stats.isDirectory()) {
      // Si es un directorio, llamamos recursivamente
      await uploadFiles(fullPath, `${destPath}/${file}`);
    } else {
      // Si es un archivo, lo subimos
      const destination = `${destPath}/${file}`;
      // Ignoro .DS_Store
      if (file === '.DS_Store') {
        continue;
      }
      await storage.bucket(bucketName).upload(fullPath, { destination });
    }
  }
};

const run = async () => {
  // Corriendo en modo debug
  if (isDebugMode) {
    console.log(`Running in debug mode...`);

    // Debug extractor
    if (DEBUG_EXTRACTOR) {
      // Encuentro el extractor
      const toDebug = extractors.find(
        (e) => e.config.source === DEBUG_EXTRACTOR
      );

      if (!toDebug) {
        console.error(`Extractor ${DEBUG_EXTRACTOR} not found`);
      } else {
        await toDebug.debug();
      }
    }

    // Debug generator
    if (DEBUG_GENERATOR) {
      // Encuentro el generator
      const toDebug = generators.find((t) => t.getId() === DEBUG_GENERATOR);

      if (!toDebug) {
        console.error(`Generator ${DEBUG_GENERATOR} not found`);
      } else {
        await toDebug.debug();
      }
    }
  }
  // Corriendo en modo producción
  else {
    // Ejecuto los extractores
    for (const extractor of extractors) {
      await extractor.extract();
    }

    // Ejecuto los generadores
    for (const generator of generators) {
      await generator.run();
    }

    // Sicronizo la carpeta _generated
    const folderName = '_generated';

    // Borro los archivos antiguos
    const [toDelete] = await storage
      .bucket(bucketName)
      .getFiles({ prefix: `${folderName}/` });
    if (toDelete.length > 0) {
      const deletePromises = toDelete.map((file) => file.delete());
      await Promise.all(deletePromises);
    }

    // Subo los archivos nuevos
    const dirPath = path.join(process.cwd(), 'data', 'sources', '_generated');
    await uploadFiles(dirPath, '_generated');
    console.log('> Generated folder synced');
  }

  process.exit(0);
};

run();
