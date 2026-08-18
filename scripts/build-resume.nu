#!/usr/bin/env nu

def main [source_tex: path, output_pdf: path, title_font?: path] {
  let build_dir = (^mktemp -d | str trim)
  let source = ($source_tex | path expand)
  let output = ($output_pdf | path expand)
  let local_tex = ($build_dir | path join 'resume.tex')
  let local_font = ($build_dir | path join 'InstrumentSerif-Regular.ttf')

  let resolved_font = if $title_font != null {
    $title_font | path expand
  } else {
    let build = (^nix build --no-link --print-out-paths '.#instrument-serif' | complete)
    if $build.exit_code != 0 or ($build.stdout | str trim | is-empty) {
      rm --recursive --force $build_dir
      error make {
        msg: $"Could not resolve Instrument Serif from the flake.\n($build.stderr)"
      }
    }
    $build.stdout | str trim
  }

  cp $resolved_font $local_font
  open --raw $source
  | str replace 'Path=./' $"Path=($build_dir)/"
  | save $local_tex

  let compile = (
    ^xelatex
      -halt-on-error
      -interaction=nonstopmode
      $"-output-directory=($build_dir)"
      $local_tex
    | complete
  )

  if $compile.exit_code != 0 {
    rm --recursive --force $build_dir
    error make {msg: $"($compile.stdout)\n($compile.stderr)"}
  }

  cp ($build_dir | path join 'resume.pdf') $output
  rm --recursive --force $build_dir
}
