{
  description = "ukg.one static site and deployment tooling";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = {self, nixpkgs, ...}: let
    systems = ["aarch64-darwin" "x86_64-darwin" "aarch64-linux" "x86_64-linux"];
    forAllSystems = nixpkgs.lib.genAttrs systems;
  in {
    packages = forAllSystems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      site = pkgs.runCommand "ukg-one-site" {} ''
        mkdir -p "$out"
        cp ${./index.html} "$out/index.html"
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
