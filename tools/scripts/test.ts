import {
  TextractClient,
  DetectDocumentTextCommand,
  AnalyzeDocumentCommand,
} from '@aws-sdk/client-textract';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

// Crear el cliente de Amazon Textract
const textractClient = new TextractClient({
  region: 'us-east-1', // Cambia la región si es necesario
});

const run = async () => {
  try {
    // Leer el archivo de imagen
    const contentBytes = await fs.promises.readFile(
      path.join(process.cwd(), 'data', 'test.png')
    );

    // // Crear el comando de detección de texto
    // const command = new DetectDocumentTextCommand({
    //   Document: {
    //     Bytes: imageBytes,
    //   },
    // });

    // Crear el comando de detección de tabla
    const command = new AnalyzeDocumentCommand({
      Document: { Bytes: contentBytes },
      FeatureTypes: ['TABLES'],
    });

    // Enviar el comando a Textract
    const response = await textractClient.send(command);

    // Imprimir el resultado
    if (response.Blocks) {
      // Filtro solo las CELLS
      const cells = response.Blocks.filter(
        (block) => block.BlockType === 'CELL'
      );

      // Muestro los ColumnIndex y RowIndex de cada celda
      cells.forEach((cell) => {
        console.log(
          `ColumnIndex: ${cell.ColumnIndex}, RowIndex: ${cell.RowIndex}`
        );
      });

      //   // Mostrar el reponse en vscode
      //   const tmpFilePath = path.join(
      //     os.tmpdir(),
      //     `${new Date().valueOf()}.json`
      //   );
      //   await fs.promises.writeFile(
      //     tmpFilePath,
      //     JSON.stringify(response.Blocks, null, 2)
      //   );
      //   execSync(`code ${tmpFilePath}`);
    } else {
      console.log('No se encontró texto.');
    }
  } catch (error) {
    console.error('Error analizando el documento:', error);
  }
};

run();
