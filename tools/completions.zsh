#compdef molt-mascot

# Zsh completions for molt-mascot CLI
# Install: copy to a directory in $fpath, or source directly
#   cp tools/completions.zsh /usr/local/share/zsh/site-functions/_molt-mascot

local -a alignment_values=(
  'bottom-right' 'bottom-left' 'top-right' 'top-left'
  'top-center' 'bottom-center' 'center-left' 'center-right' 'center'
)

local -a size_values=(
  'tiny' 'small' 'medium' 'large' 'xlarge'
)

_arguments -s -S \
  '(-v --version)'{-v,--version}'[Print version and exit]' \
  '(-h --help)'{-h,--help}'[Print help and exit]' \
  '--gateway[Gateway WebSocket URL]:url:_urls' \
  '--token[Gateway auth token]:token:' \
  '--align[Window alignment]:position:(${alignment_values})' \
  '--size[Size preset]:size:(${size_values})' \
  '--opacity[Window opacity (0.0-1.0)]:opacity:' \
  '--padding[Edge padding in pixels]:pixels:' \
  '--click-through[Start in ghost mode]' \
  '--hide-text[Start with HUD text hidden]' \
  '--debug[Open DevTools on launch]' \
  '--disable-gpu[Disable hardware acceleration]' \
  '--min-protocol[Minimum Gateway protocol version]:version:' \
  '--max-protocol[Maximum Gateway protocol version]:version:' \
  '--list-prefs[Print saved preferences and exit]' \
  '--reset-prefs[Clear saved preferences and start fresh]' \
  '--set-pref[Set a single preference]:key=value:' \
  '--unset-pref[Remove a preference]:key:' \
  '--get-pref[Print a single preference value]:key:' \
  '--help-prefs[Print available preference keys]' \
  '--sleep-threshold[Idle seconds before sleep overlay]:seconds:' \
  '--idle-delay[Delay before returning to idle]:ms:' \
  '--error-hold[How long to show error state]:ms:' \
  '--reduced-motion[Disable animations]' \
  '--status[Print resolved config and exit]' \
  '--start-hidden[Launch hidden (tray-only)]' \
  '--no-tray[Disable system tray icon]' \
  '--no-shortcuts[Disable global keyboard shortcuts]' \
  '--capture-dir[Screenshot capture directory]:directory:_directories' \
  '--json[Machine-readable JSON output (with --status, --list-prefs, --help-prefs, --get-pref)]'
