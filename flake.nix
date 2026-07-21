{
  description = "ukg.one static site and deployment tooling";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = {self, nixpkgs, ...}: let
    systems = ["aarch64-darwin" "x86_64-darwin" "aarch64-linux" "x86_64-linux"];
    forAllSystems = nixpkgs.lib.genAttrs systems;
  in {
    packages = forAllSystems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
      qwigley = pkgs.fetchurl {
        url = "https://fonts.gstatic.com/s/qwigley/v20/1cXzaU3UGJb5tGoCiVtminuCicA.woff2";
        hash = "sha256-vtSNrjIJbSrRheWPY+inKBbfVF6tD59yAUwjL1H1x4s=";
      };
      departureMono = pkgs.fetchurl {
        url = "https://github.com/rektdeckard/departure-mono/releases/download/v1.500/DepartureMono-1.500.zip";
        hash = "sha256-vz5IBZru9GF+xYW96oHcw0kcV2s+ekcvUvr0DgnuXDo=";
      };
      googleFontsRevision = "684b69db51d59a3137ec0152fa3a3afc6f1b3814";
      instrumentSerif = pkgs.fetchurl {
        url = "https://raw.githubusercontent.com/google/fonts/${googleFontsRevision}/ofl/instrumentserif/InstrumentSerif-Regular.ttf";
        hash = "sha256-SY79Rh9t38t6ERv5pWVwnSCF1IIB1QHq2WDZPoT/u4g=";
      };
    in {
      site = pkgs.runCommand "ukg-one-site" {
        nativeBuildInputs = [
          pkgs.unzip
          (pkgs.python3.withPackages (pythonPackages: [
            pythonPackages.brotli
            pythonPackages.fonttools
          ]))
        ];
      } ''
        mkdir -p "$out/fonts"
        cp ${./index.html} "$out/index.html"

        subset_font() {
          pyftsubset "$1" \
            --output-file="$out/fonts/$2" \
            --flavor=woff2 \
            --unicodes="U+0020-007E,U+00B7,U+203A"
        }

        subset_font ${instrumentSerif} instrument-serif-latin.woff2
        cp ${qwigley} "$out/fonts/qwigley-v20-latin.woff2"
        unzip -p ${departureMono} \
          DepartureMono-1.500/DepartureMono-Regular.woff2 \
          > "$out/fonts/departure-mono-v1500-regular.woff2"
      '';

      deploy = pkgs.writeShellApplication {
        name = "deploy-ukg-one";
        runtimeInputs = [pkgs.deno pkgs.nix];
        text = ''
          exec deno task deploy "$@"
        '';
      };

      default = self.packages.${system}.site;
    });

    apps = forAllSystems (system: {
      deploy = {
        type = "app";
        program = "${self.packages.${system}.deploy}/bin/deploy-ukg-one";
        meta.description = "Deploy ukg.one to Cloudflare with Deno and Alchemy";
      };
    });

    checks = forAllSystems (system: {
      site = self.packages.${system}.site;
    });

    devShells = forAllSystems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      default = pkgs.mkShell {
        packages = [pkgs.deno pkgs.openssl];
      };
    });
  };
}
