import { spawn } from 'node:child_process';
// Cross-platform npm entry point: no shell-specific environment assignment.
const child = spawn(process.execPath, ['node_modules/concurrently/dist/bin/concurrently.js', '-k', '-n', 'SERVER,CLIENT', 'npm:dev:server', 'npm:dev:client'], {
  stdio: 'inherit', env: {...process.env, DEBUG_GAME: '1', NODE_ENV: 'development'},
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 0));
