#!/usr/bin/env nu

def main [source_tex: path, output_pdf: path] {
  let build_dir = (^mktemp -d | str trim)
  let pdf_name = (
    $source_tex
    | path basename
    | str replace '.tex' '.pdf'
  )

  let compile = (
    ^pdflatex
      -halt-on-error
      -interaction=nonstopmode
      $"-output-directory=($build_dir)"
      $source_tex
    | complete
  )

  if $compile.exit_code != 0 {
    rm --recursive --force $build_dir
    error make {msg: $compile.stderr}
  }

  cp ($build_dir | path join $pdf_name) $output_pdf
  rm --recursive --force $build_dir
}
