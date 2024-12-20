import { BaseExtractor } from '../lib/extractors/BaseExtractor';
import path from 'path';
import fs from 'fs';

const extractors: BaseExtractor[] = [];

// Define la ruta base donde están los extractores
const extractorsPath = path.resolve(__dirname);

// Función recursiva para buscar y cargar todos los extractores
function loadExtractorsRecursively(dir: string) {
  fs.readdirSync(dir).forEach((item) => {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      // Si es un directorio, busca dentro de él
      loadExtractorsRecursively(fullPath);
    } else if (item === 'Extractor.ts' || item === 'Extractor.js') {
      // Si es un archivo que coincide con el patrón, cárgalo
      const extractor = require(fullPath).default;
      if (extractor) {
        extractors.push(extractor);
      }
    }
  });
}

// Cargar todos los extractores desde la carpeta base
loadExtractorsRecursively(extractorsPath);

// Exportar los extractores
export default extractors;
