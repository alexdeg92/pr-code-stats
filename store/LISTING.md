# Chrome Web Store listing (copy into the developer dashboard)

## Store listing tab

Name: PR Code Stats

Summary (from manifest, 132 chars max):
See how many lines a GitHub pull request really changes, without test files or comments. One click to count tests again.

Category: Developer Tools

Language: English

Description:

AI coding agents write a lot of tests. A pull request that changes 180 lines of code now often shows +950 in the header, because the rest is test files. That makes it hard to judge the real size of a change at a glance.

PR Code Stats replaces the line count in the pull request header with the count of real code. Test files are left out, and if you like, comments and blank lines too. The pill next to the count switches tests back in, and hovering it shows the breakdown.

Features:
- Shows the line count without test files by default
- Optional: leave out comments and blank lines as well
- Flags Markdown files with a "docs" warning, so documentation doesn't pass for code
- Hover for the breakdown: code, docs and tests, file counts, share of added lines
- Auto-view tests on the Files changed page: marks test files as Viewed and folds test folders, so you only scroll through real code. Off by default, and turning it off undoes only what it did
- Click the toolbar icon to switch any of these on or off
- Works on private repositories using your existing GitHub login, no token required
- An optional GitHub token lets Auto-view use GitHub's API, so it keeps working when GitHub changes its page
- Test file patterns are editable (one regex per line) on the options page
- Default patterns cover JavaScript/TypeScript, Python, Go, Ruby, Swift, Kotlin, Java, C#, PHP, snapshots, Cypress and Playwright

Privacy: no server, no analytics, no tracking. The extension only talks to GitHub, to fetch the pull request you are viewing.

Not affiliated with or endorsed by GitHub.

Assets:
- Icon: store/store-icon-128.png
- Screenshots (1280x800, the Store takes 5), upload in this order:
  1. store/screenshot-3-comparison.png
  2. store/screenshot-1-without-tests.png
  3. store/screenshot-5-comments-and-docs.png
  4. store/screenshot-4-auto-view-tests.png
  5. store/screenshot-6-popup.png
- store/screenshot-2-with-tests.png is no longer uploaded; the comparison shows the same thing

## Privacy practices tab

Single purpose:
Shows the number of lines changed in a GitHub pull request excluding test files, with a toggle to include them.

Permission justifications:
- storage: Saves the user's toggle choices and settings, their test file patterns, an optional GitHub token, and which files the "Auto-view tests" switch marked as viewed so it can undo them.
- Host permission github.com: Reads the pull request header to show the adjusted line count, and downloads the pull request's diff to count lines per file.
- Host permission patch-diff.githubusercontent.com: GitHub redirects pull request diff downloads to this host.
- Host permission api.github.com: Fallback for fetching a pull request's file list when the diff is unavailable. With the user's own token, also marks test files as viewed when the user turns on "Auto-view tests".

Remote code: No, I am not using remote code.

Data usage, tick:
- Authentication information (the optional GitHub token the user enters)
- Website content (pull request diffs, used only to count lines)

Certify all three:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

Privacy policy URL: https://github.com/alexdeg92/pr-code-stats/blob/main/PRIVACY.md

Homepage / support URL: https://github.com/alexdeg92/pr-code-stats
