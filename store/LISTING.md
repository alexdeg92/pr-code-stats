# Chrome Web Store listing (copy into the developer dashboard)

## Store listing tab

Name: PR Code Stats

Summary (from manifest, 132 chars max):
See how many lines a GitHub pull request really changes, without test files. One click to include them again.

Category: Developer Tools

Language: English

Description:

AI coding agents write a lot of tests. A pull request that changes 180 lines of code now often shows +950 in the header, because the rest is test files. That makes it hard to judge the real size of a change at a glance.

PR Code Stats replaces the line count in the pull request header with the count excluding test files. A small toggle next to it switches back to the full count, and hovering it shows the split between code and tests.

Features:
- Shows the line count without test files by default
- One click to include tests; your choice is remembered
- Hover for the breakdown: code vs tests, file counts, share of added lines
- Works on private repositories using your existing GitHub login, no token required
- Test file patterns are editable (regex per line) on the options page
- Default patterns cover JavaScript/TypeScript, Python, Go, Ruby, Swift, Kotlin, Java, C#, PHP, snapshots, Cypress and Playwright

Privacy: no server, no analytics, no tracking. The extension only talks to GitHub, to fetch the pull request you are viewing.

Not affiliated with or endorsed by GitHub.

Assets:
- Icon: store/store-icon-128.png
- Screenshots (1280x800): store/screenshot-*.png

## Privacy practices tab

Single purpose:
Shows the number of lines changed in a GitHub pull request excluding test files, with a toggle to include them.

Permission justifications:
- storage: Saves the user's toggle choice, their test file patterns, and an optional GitHub token.
- Host permission github.com: Reads the pull request header to show the adjusted line count, and downloads the pull request's diff to count lines per file.
- Host permission patch-diff.githubusercontent.com: GitHub redirects pull request diff downloads to this host.
- Host permission api.github.com: Fallback for fetching a pull request's file list when the diff is unavailable, and used when the user supplies their own token.

Remote code: No, I am not using remote code.

Data usage, tick:
- Authentication information (the optional GitHub token the user enters)
- Website content (pull request diffs, used only to count lines)

Certify all three:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

Privacy policy URL: link to PRIVACY.md in the public repository.
