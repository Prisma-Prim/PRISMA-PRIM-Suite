import { evaluateEngine, evaluateScenarios } from './evaluation.js';

const report = { summary: evaluateEngine(), scenarios: evaluateScenarios() };
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.scenarios.some((scenario) => !scenario.passed)) process.exitCode = 1;
