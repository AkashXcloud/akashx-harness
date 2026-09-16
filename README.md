# AkashX Harness

English | [中文](README.zh.md)

AkashX Harness (`akx`) is an open-source agent harness developed by [AkashX AI](https://akashx.com).

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://akx-harness.github.io/akx-harness/](https://akx-harness.github.io/akx-harness/)

## Developer preview

AkashX Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.md) before running the project.

## Run

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @akashx/akx web
```

The command starts the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser for a local launch. An SSH launch only prints the host URL because the SSH client or editor owns the local forwarded address. Pass `--no-open` to run the server without opening a browser. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/akashx-ai/akx-harness.git
cd akx-harness
pnpm install
pnpm run build
pnpm akx web
```

`pnpm run build` prepares the repository artifacts. `pnpm akx web` uses those built artifacts without rebuilding.

## Community and support

- Submit feedback or bug reports through [GitHub Discussions](https://github.com/akashx-ai/akx-harness/discussions).
- Add the [`akx-plugin`](https://github.com/topics/akx-plugin) topic to your plugin repository for discoverability.
- Join <a href="https://discord.gg/Ycq5dCaS4">AkashX Harness Discord community</a>.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

## Citation

```bibtex
@misc{akx-harness2026,
  title={AkashX Harness: Everything is a Plugin},
  author={AkashX-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/akashx-ai/akx-harness}},
}
```

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
