# Bash completions for molt-mascot CLI
# Install: source tools/completions.bash
#   echo 'source /path/to/molt-mascot/tools/completions.bash' >> ~/.bashrc

_molt_mascot() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  local prev="${COMP_WORDS[COMP_CWORD-1]}"

  case "$prev" in
    --align)
      COMPREPLY=( $(compgen -W "bottom-right bottom-left top-right top-left top-center bottom-center center-left center-right center" -- "$cur") )
      return ;;
    --size)
      COMPREPLY=( $(compgen -W "tiny small medium large xlarge" -- "$cur") )
      return ;;
    --capture-dir)
      COMPREPLY=( $(compgen -d -- "$cur") )
      return ;;
    --gateway|--token|--opacity|--padding|--min-protocol|--max-protocol|--sleep-threshold|--idle-delay|--error-hold|--set-pref|--unset-pref|--get-pref)
      return ;;
  esac

  COMPREPLY=( $(compgen -W "-v --version -h --help --gateway --token --align --size --opacity --padding --click-through --hide-text --debug --disable-gpu --min-protocol --max-protocol --list-prefs --reset-prefs --set-pref --unset-pref --get-pref --help-prefs --sleep-threshold --idle-delay --error-hold --reduced-motion --status --start-hidden --no-tray --no-shortcuts --capture-dir --json" -- "$cur") )
}

complete -F _molt_mascot molt-mascot
