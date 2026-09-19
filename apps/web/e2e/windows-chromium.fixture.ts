import { test as base } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

function processId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Expected a positive browser process ID from Chromium.');
  }
  return value;
}

// Chromium 139 raises its Windows GPU process above the test driver, including
// CPU-only SwiftShader. Keep their scheduling priorities equal without changing
// the shader, animation, browser arguments, or behavioral assertions. See #228.
export const test = base.extend({
  browser: async ({ browser }, use) => {
    if (process.platform === 'win32') {
      const cdp = await browser.newBrowserCDPSession();
      try {
        const { gpu } = await cdp.send('SystemInfo.getInfo');
        const attributes: unknown = gpu.auxAttributes;
        if (
          typeof attributes !== 'object' ||
          attributes === null ||
          !('glRenderer' in attributes) ||
          typeof attributes.glRenderer !== 'string'
        ) {
          throw new Error('Cannot identify the Windows Chromium renderer.');
        }
        if (attributes.glRenderer.includes('SwiftShader')) {
          const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
          const gpuId = processId(
            processInfo.find((entry) => entry.type === 'GPU')?.id,
          );
          const browserId = processId(
            processInfo.find((entry) => entry.type === 'browser')?.id,
          );
          // Only validated integers enter this script. Hold process handles while
          // proving ancestry and changing priority, preventing PID reuse races.
          const result = execFileSync(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              [
                "$ErrorActionPreference = 'Stop'",
                '$gpu = Get-Process -Id ' + gpuId,
                '$browser = Get-Process -Id ' + browserId,
                '$worker = Get-Process -Id ' + process.pid,
                'try {',
                '  $handles = @($gpu.Handle, $browser.Handle, $worker.Handle)',
                '  $nodes = @(Get-CimInstance Win32_Process -Filter "ProcessId = ' +
                  gpuId +
                  ' OR ProcessId = ' +
                  browserId +
                  ' OR ProcessId = ' +
                  process.pid +
                  '")',
                '  $gpuNode = $nodes | Where-Object ProcessId -eq $gpu.Id',
                '  $browserNode = $nodes | Where-Object ProcessId -eq $browser.Id',
                '  $workerNode = $nodes | Where-Object ProcessId -eq $worker.Id',
                '  if ($nodes.Count -ne 3 -or -not $gpuNode -or -not $browserNode -or -not $workerNode -or $gpuNode.ParentProcessId -ne $browser.Id -or $browserNode.ParentProcessId -ne $worker.Id -or $gpuNode.CreationDate -lt $browserNode.CreationDate -or $browserNode.CreationDate -lt $workerNode.CreationDate -or $gpu.HasExited -or $browser.HasExited -or $worker.HasExited) { throw "Test browser ownership proof failed; priority was not changed." }',
                '  $before = $gpu.PriorityClass.ToString()',
                '  $lower = $before -in @("AboveNormal", "High", "RealTime")',
                '  if ($lower) { $gpu.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::Normal }',
                '  $gpu.Refresh()',
                '  $after = $gpu.PriorityClass.ToString()',
                '  if (($lower -and $after -ne "Normal") -or $after -notin @("Normal", "BelowNormal", "Idle")) { throw "Test GPU priority adjustment could not be verified." }',
                '  [pscustomobject]@{worker=$worker.Id; browser=$browser.Id; gpu=$gpu.Id; before=$before; after=$after} | ConvertTo-Json -Compress',
                '} finally { $gpu.Dispose(); $browser.Dispose(); $worker.Dispose() }',
              ].join('\n'),
            ],
            { encoding: 'utf8', windowsHide: true, timeout: 15000 },
          );
          console.log(
            '[windows-swiftshader]',
            browser.version(),
            result.trim(),
          );
        }
      } finally {
        await cdp.detach();
      }
    }
    await use(browser);
  },
});
