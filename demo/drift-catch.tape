# VHS tape — renders demo/drift-catch.gif headlessly.
# Install VHS (https://github.com/charmbracelet/vhs), then:  vhs demo/drift-catch.tape
# VHS records a real terminal running the self-contained demo, so the GIF is
# always reproducible and in sync with the actual tool output.

Output demo/drift-catch.gif

Set Shell bash
Set FontSize 16
Set Width 1200
Set Height 760
Set Padding 20
Set Theme "Dracula"

Type "bash demo/run.sh"
Enter
Sleep 6s
