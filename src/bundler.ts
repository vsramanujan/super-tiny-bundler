import fs from 'fs';
import path from 'path';
import * as babylon from 'babylon';
import babelTraverse from 'babel-traverse';
import * as babel from 'babel-core';

let id = 1;

interface Asset {
  id: number;
  filename: string;
  dependencies: string[];
  code: string | undefined;
  mapping?: {
    [key: string]: number;
  };
}

const createAsset: (filename: string) => Asset = filename => {
  const contents = fs.readFileSync(filename, {
    encoding: 'UTF-8'
  });
  const ast = babylon.parse(contents, {
    sourceType: 'module'
  });
  const dependencies: string[] = [];

  babelTraverse(ast, {
    ImportDeclaration: ({ node }) => {
      dependencies.push(node.source.value);
    }
  });
  // NOTE: This is where loaders come in -> I've added babel loader by default so that stuff will work
  const { code } = babel.transformFromAst(ast, undefined, {
    presets: ['env']
  });

  return {
    id: id++,
    filename,
    dependencies,
    code
  };
};

const createGraphOfEnrichedAssets: (entryFile: string) => Asset[] = entryFile => {
  const queue: Asset[] = [];
  const mainAsset = createAsset(entryFile);
  queue.push(mainAsset);

  for (let asset of queue) {
    const dirname = path.dirname(asset.filename);
    asset.mapping = {};
    asset.dependencies.forEach(relativePath => {
      const absolutePath = path.join(dirname, relativePath) + '.js';
      const childAsset = createAsset(absolutePath);
      // To pacify typescript compiler :(
      if (asset.mapping) {
        asset.mapping[relativePath] = childAsset.id;
      }
      queue.push(childAsset);
    });
  }
  return queue;
};

const bundle: (graph: Asset[]) => string = graph => {
  let modules = '';

  graph.forEach(module => {
    modules += `${module.id}: [
        function(require, module, exports){
           ${module.code}
         },
         ${JSON.stringify(module.mapping)}
    ],`;
  });

  const result = `
    (function(modules){
      function require(id) {
         const [fn, mapping] = modules[id]; 

         function localRequire(relativePath) {
            return require(mapping[relativePath]);
         }

        const module = { exports : {} };
        fn(localRequire, module, module.exports);
        return module.exports;
      }
      require(1);
    })({${modules}})
  `;

  return result;
};

const graph = createGraphOfEnrichedAssets('input/index.js');
const result = bundle(graph);

// TODO: Make output path configurable
fs.writeFileSync('./bundle.js', result);
