import { parse } from '../vendor/acorn.mjs';
import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
/** Tiny deterministic bundler for this repository's explicit named-import modules.
 * No runtime dependency downloads. Vendored Acorn is bundled with its license. */
async function bundle(entry) {
    const modules = new Map();
    async function visit(file) {
        file = path.posix.normalize(file);
        if (modules.has(file))
            return;
        let source = await readFile(path.join(root, file), 'utf8');
        const ast = parse(source, { ecmaVersion: 2022, sourceType: 'module' });
        const imports = [], exports = [], edits = [];
        for (const node of ast.body) {
            if (node.type === 'ImportDeclaration') {
                const dep = path.posix.normalize(path.posix.join(path.posix.dirname(file), node.source.value));
                const bindings = node.specifiers.map(s => {
                    if (s.type !== 'ImportSpecifier')
                        throw new Error('Only named imports are supported: ' + file);
                    return `${s.imported.name}:${s.local.name}`;
                });
                imports.push({ dep, bindings });
                edits.push([node.start, node.end, '']);
            }
            else if (node.type === 'ExportNamedDeclaration') {
                if (node.source)
                    throw new Error('Re-exports are not supported: ' + file);
                if (node.declaration) {
                    const d = node.declaration;
                    if (d.type === 'VariableDeclaration') {
                        for (const declaration of d.declarations) {
                            if (declaration.id.type !== 'Identifier')
                                throw new Error('Destructured export not supported');
                            exports.push([declaration.id.name, declaration.id.name]);
                        }
                    }
                    else
                        exports.push([d.id.name, d.id.name]);
                    edits.push([node.start, d.start, '']);
                }
                else {
                    for (const s of node.specifiers)
                        exports.push([s.exported.name, s.local.name]);
                    edits.push([node.start, node.end, '']);
                }
            }
            else if (node.type === 'ExportDefaultDeclaration')
                throw new Error('Default export not supported');
        }
        // AST positions leave comments and strings completely unchanged.
        for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0]))
            source = source.slice(0, start) + value + source.slice(end);
        for (const { dep } of imports)
            await visit(dep);
        modules.set(file, `__modules[${JSON.stringify(file)}]=(()=>{\n${imports.map(i => `const {${i.bindings.join(',')}}=__modules[${JSON.stringify(i.dep)}];`).join('\n')}\n${source}\nreturn {${exports.map(([a, b]) => `${a}:${b}`).join(',')}};\n})();`);
    }
    await visit(entry);
    return `/* Optimizer Playground v0.3.1 | Acorn: MIT (vendor/ACORN-LICENSE) */\n(()=>{'use strict';const __modules=Object.create(null);\n${[...modules.values()].join('\n')}\n})();`;
}
await mkdir('dist', { recursive: true });
await mkdir('release', { recursive: true });
const app = await bundle('src/ui/app.js'), worker = await bundle('src/runtime/worker.js');
await writeFile('dist/app.js', app);
await writeFile('dist/worker.js', worker);
for (const name of ['index.html', 'style.css'])
    await copyFile('public/' + name, 'dist/' + name);
await copyFile('vendor/ACORN-LICENSE', 'dist/ACORN-LICENSE.txt');
let html = await readFile('public/index.html', 'utf8'), css = await readFile('public/style.css', 'utf8');
html = html.replace('<link rel="stylesheet" href="./style.css">', () => '<style>' + css + '</style>').replace('<script src="./app.js" defer></script>', '');
const license = await readFile('vendor/ACORN-LICENSE', 'utf8');
const bootstrap = 'globalThis.__OPTIMIZER_WORKER__=' + JSON.stringify(worker).replace(/</g, '\\u003c') + ';\n' + app;
html = html.replace('<head>', () => `<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; worker-src blob:; connect-src 'none'; img-src data: blob:; base-uri 'none'; form-action 'none'">`);
html = html.replace('</body>', () => '<!-- Third-party license: Acorn\n' + license.replace(/--/g, '—') + '\n--><script>' + bootstrap.replace(/<\/script/gi, '<\\/script') + '</script></body>');
await writeFile('release/Optimizer-Playground.html', html);
console.log(`Build complete: dist/ and release/Optimizer-Playground.html (${Math.round(Buffer.byteLength(html) / 1024)} KiB).`);
