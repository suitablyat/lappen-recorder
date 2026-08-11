[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Path,

  [Parameter()]
  [ValidateNotNullOrEmpty()]
  [string]$ExpectedPublisher = 'SignPath Foundation'
)

$ErrorActionPreference = 'Stop'

$resolvedPath = (Resolve-Path -LiteralPath $Path).Path
$signature = Get-AuthenticodeSignature -LiteralPath $resolvedPath

if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
  throw "Authenticode signature is not valid for '$resolvedPath': $($signature.Status) $($signature.StatusMessage)"
}

if ($null -eq $signature.SignerCertificate) {
  throw "The valid signature for '$resolvedPath' has no signer certificate."
}

$publisher = $signature.SignerCertificate.Subject
if ($publisher.IndexOf($ExpectedPublisher, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
  throw "Unexpected publisher for '$resolvedPath': '$publisher' (expected '$ExpectedPublisher')."
}

if ($null -eq $signature.TimeStamperCertificate) {
  throw "The signature for '$resolvedPath' is not timestamped."
}

Write-Host "Valid Authenticode signature"
Write-Host "  File: $resolvedPath"
Write-Host "  Publisher: $publisher"
Write-Host "  Timestamp authority: $($signature.TimeStamperCertificate.Subject)"
