function ConvertFrom-KlayMigrationHistory {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][AllowEmptyString()][string[]] $OutputLines,
    [Parameter(Mandatory = $true)][string[]] $LocalVersions,
    [Parameter(Mandatory = $true)][int] $ExitCode,
    [int] $ExpectedCount = 40,
    [switch] $F07MigrationStateInspection
  )

  if ($ExitCode -ne 0) {
    throw "Supabase migration list exited with code $ExitCode."
  }
  if ($ExpectedCount -le 0 -or $LocalVersions.Count -ne $ExpectedCount) {
    throw "Expected exactly $ExpectedCount local migration versions; received $($LocalVersions.Count)."
  }
  foreach ($version in $LocalVersions) {
    if ($version -cnotmatch '^[0-9]{14}$') { throw "Malformed local migration version: '$version'." }
  }
  if (@($LocalVersions | Sort-Object -Unique).Count -ne $ExpectedCount) {
    throw 'Local migration filenames contain duplicate versions.'
  }
  $pendingVersion = '20261101030000'
  if ($F07MigrationStateInspection -and ($ExpectedCount -ne 40 -or
      ($LocalVersions | Sort-Object)[-1] -cne $pendingVersion)) {
    throw 'F07 read-only inspection requires exactly 40 local versions ending in 20261101030000.'
  }

  $headerSeen = $false
  $separatorSeen = $false
  $rows = [System.Collections.Generic.List[object]]::new()

  foreach ($rawLine in $OutputLines) {
    $line = ([string]$rawLine).Trim()
    if ([string]::IsNullOrWhiteSpace($line)) { continue }

    if (-not $headerSeen) {
      if ($line -notmatch '\|') { continue } # CLI progress on stdout/stderr is not a table row.
      $headerCells = @(ConvertTo-KlayTableCells -Line $line)
      if ($headerCells.Count -eq 3 -and
          $headerCells[0] -match '^local$' -and
          $headerCells[1] -match '^remote$' -and
          $headerCells[2] -match '^time(?:\s*\(utc\))?$') {
        $headerSeen = $true
        continue
      }
      if ($line -match '(?i)local' -and $line -match '(?i)remote') {
        throw 'Malformed migration history table header.'
      }
      throw "Unexpected table row before migration history header: '$line'."
    }

    if (-not $separatorSeen) {
      $separatorCells = @(ConvertTo-KlayTableCells -Line $line)
      if ($separatorCells.Count -ne 3 -or
          @($separatorCells | Where-Object { $_ -notmatch '^:?-{3,}:?$' }).Count -ne 0) {
        throw 'Malformed migration history table separator.'
      }
      $separatorSeen = $true
      continue
    }

    if ($line -notmatch '\|') {
      throw "Unexpected non-table output after migration history header: '$line'."
    }

    $cells = @(ConvertTo-KlayTableCells -Line $line)
    if ($cells.Count -ne 3) { throw "Malformed migration history row: '$line'." }
    $localVersion = Remove-KlayMarkdownCodeTicks -Cell $cells[0]
    $remoteVersion = Remove-KlayMarkdownCodeTicks -Cell $cells[1]
    $permittedPending = $F07MigrationStateInspection -and
      $localVersion -ceq $pendingVersion -and $remoteVersion -ceq ''
    if ($localVersion -cnotmatch '^[0-9]{14}$' -or
        (-not $permittedPending -and $remoteVersion -cnotmatch '^[0-9]{14}$')) {
      throw "Migration row has a missing or malformed Local/Remote version: '$line'."
    }
    if (-not $permittedPending -and $localVersion -cne $remoteVersion) {
      throw "Migration row has unmatched Local and Remote versions: '$line'."
    }
    $rows.Add([pscustomobject]@{ Local = $localVersion; Remote = $remoteVersion })
  }

  if (-not $headerSeen -or -not $separatorSeen) { throw 'Migration history output did not contain a complete table.' }
  if ($rows.Count -ne $ExpectedCount) {
    throw "Expected exactly $ExpectedCount migration rows; parsed $($rows.Count)."
  }

  $rowLocalVersions = @($rows | ForEach-Object { $_.Local })
  $pendingRows = @($rows | Where-Object { $_.Remote -ceq '' })
  if ($pendingRows.Count -gt 1) { throw 'More than one pending migration is forbidden.' }
  $rowRemoteVersions = @($rows | Where-Object { $_.Remote -cne '' } | ForEach-Object { $_.Remote })
  if (@($rowLocalVersions | Sort-Object -Unique).Count -ne $ExpectedCount) {
    throw 'Migration history contains duplicate Local versions.'
  }
  if (@($rowRemoteVersions | Sort-Object -Unique).Count -ne ($ExpectedCount - $pendingRows.Count)) {
    throw 'Migration history contains duplicate Remote versions.'
  }

  $expectedSorted = @($LocalVersions | Sort-Object)
  $localSorted = @($rowLocalVersions | Sort-Object)
  $remoteSorted = @($rowRemoteVersions | Sort-Object)
  if ((Compare-Object -ReferenceObject $expectedSorted -DifferenceObject $localSorted).Count -ne 0) {
    throw 'CLI Local migration versions do not exactly match local migration filenames.'
  }
  $expectedRemote = @($expectedSorted | Where-Object { $pendingRows.Count -eq 0 -or $_ -cne $pendingVersion })
  if ((Compare-Object -ReferenceObject $expectedRemote -DifferenceObject $remoteSorted).Count -ne 0) {
    throw 'CLI Remote migration versions do not exactly match local migration filenames.'
  }

  [pscustomobject]@{ Count = $rows.Count; LocalVersions = $localSorted; RemoteVersions = $remoteSorted;
    PendingVersions = @($pendingRows | ForEach-Object { $_.Local }); InstallationComplete = ($pendingRows.Count -eq 0) }
}

function ConvertTo-KlayTableCells {
  param([Parameter(Mandatory = $true)][string] $Line)
  $content = $Line.Trim()
  $bordered = $content.StartsWith('|')
  if ($bordered) { $content = $content.Substring(1) }
  # In an unbordered CLI table a final pipe can delimit an empty Time cell.
  # Only remove a closing Markdown border when there was an opening border.
  if ($bordered -and $content.EndsWith('|')) { $content = $content.Substring(0, $content.Length - 1) }
  @($content.Split([char]'|') | ForEach-Object { (Remove-KlayMarkdownCodeTicks -Cell $_).Trim() })
}

function Remove-KlayMarkdownCodeTicks {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string] $Cell)
  $value = $Cell.Trim()
  if ($value.StartsWith('`') -and $value.EndsWith('`') -and $value.Length -ge 2) {
    $value = $value.Substring(1, $value.Length - 2).Trim()
  }
  $value
}
