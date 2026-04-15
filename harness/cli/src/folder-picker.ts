export async function pickProjectFolder(): Promise<string | undefined> {
  if (process.platform !== "win32") {
    throw new Error(`Folder picker is not supported on ${process.platform}`);
  }

  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    "$dialog.Description = 'Select project folder'",
    "$dialog.UseDescriptionForTitle = $true",
    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
    "  [Console]::Out.Write($dialog.SelectedPath)",
    "}"
  ].join("; ");

  const proc = Bun.spawn({
    cmd: ["powershell.exe", "-NoProfile", "-Sta", "-Command", script],
    stdout: "pipe",
    stderr: "pipe"
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);

  if (exitCode !== 0) {
    const detail = stderr.trim() || `Folder picker exited with code ${exitCode}`;
    throw new Error(detail);
  }

  const selectedPath = stdout.trim();
  return selectedPath.length > 0 ? selectedPath : undefined;
}
