# Security Policy

## Supported versions

videos-sdk is pre-1.0. Security fixes are released against the latest published
version on npm. Please always upgrade to the latest release before reporting.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, report them privately through GitHub Security Advisories:

> [Report a vulnerability](https://github.com/Rehelios/videos-sdk/security/advisories/new)

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce (a proof of concept, if possible)
- The affected version(s)

We aim to acknowledge reports within 72 hours and to provide a remediation timeline
after triage. We'll credit you in the release notes unless you prefer to remain
anonymous.

## Scope

This project is a client SDK. Never commit provider API keys or secrets — keep them in
environment variables. Reports about leaked credentials in this repository, or about
the SDK mishandling secrets, are in scope.
