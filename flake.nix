{
  description = "ukg.one static site and deployment tooling";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = {self, nixpkgs, ...}: let
    systems = ["aarch64-darwin" "x86_64-darwin" "aarch64-linux" "x86_64-linux"];
    forAllSystems = nixpkgs.lib.genAttrs systems;
  in {
    packages = forAllSystems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
      iosevka = pkgs.fetchurl {
        url = "https://cdnjs.cloudflare.com/ajax/libs/Iosevka/11.1.1/iosevka/woff2/iosevka-regular.woff2";
        hash = "sha256-n0rea9DQb1sJss4H0gROoFcF7togjM/+qSiah95ZyA8=";
      };
      qwigley = pkgs.fetchurl {
        url = "https://fonts.gstatic.com/s/qwigley/v20/1cXzaU3UGJb5tGoCiVtminuCicA.woff2";
        hash = "sha256-vtSNrjIJbSrRheWPY+inKBbfVF6tD59yAUwjL1H1x4s=";
      };
    in {
      site = pkgs.runCommand "ukg-one-site" {
        nativeBuildInputs = [
          pkgs.esbuild
          (pkgs.python3.withPackages (pythonPackages: [
            pythonPackages.brotli
            pythonPackages.fonttools
          ]))
        ];
      } ''
        mkdir -p "$out/fonts"
        cp ${./index.html} "$out/index.html"
        esbuild ${./shortcuts.ts} --bundle --minify --platform=browser \
          --outfile=shortcuts.js
        substituteInPlace "$out/index.html" \
          --replace-fail "/* __SHORTCUTS__ */" "$(cat shortcuts.js)"
        pyftsubset ${iosevka} \
          --output-file="$out/fonts/iosevka-11.1.1-latin.woff2" \
          --flavor=woff2 \
          --unicodes="U+0020-007E,U+00B7,U+203A"
        cp ${qwigley} "$out/fonts/qwigley-v20-latin.woff2"
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
