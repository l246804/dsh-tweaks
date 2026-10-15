# dsh-tweaks

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![bundle][bundle-src]][bundle-href]
[![JSDocs][jsdocs-src]][jsdocs-href]
[![License][license-src]][license-href]

Tweaks that improve the DeepSeek Harness (DSH) experience.

## Note for Developers

This starter recommands using [npm Trusted Publisher](https://github.com/e18e/ecosystem-issues/issues/201), where the release is done on CI to ensure the security of the packages.

To do so, you need to run `pnpm publish` manually for the very first time to create the package on npm, and then go to `https://www.npmjs.com/package/<your-package-name>/access` to set the connection to your GitHub repo.

Then for the future releases, you can run `pnpm run release` to do the release and the GitHub Actions will take care of the release process.

## License

[MIT](./LICENSE) License © [leiwang](https://github.com/l246804)

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/@leiwang2000/dsh-tweaks?style=flat&colorA=080f12&colorB=1fa669
[npm-version-href]: https://npmx.dev/package/@leiwang2000/dsh-tweaks
[npm-downloads-src]: https://img.shields.io/npm/dm/@leiwang2000/dsh-tweaks?style=flat&colorA=080f12&colorB=1fa669
[npm-downloads-href]: https://npmx.dev/package/@leiwang2000/dsh-tweaks
[bundle-src]: https://img.shields.io/bundlephobia/minzip/@leiwang2000/dsh-tweaks?style=flat&colorA=080f12&colorB=1fa669&label=minzip
[bundle-href]: https://bundlephobia.com/result?p=@leiwang2000/dsh-tweaks
[license-src]: https://img.shields.io/github/license/l246804/dsh-tweaks.svg?style=flat&colorA=080f12&colorB=1fa669
[license-href]: https://github.com/l246804/dsh-tweaks/blob/main/LICENSE
[jsdocs-src]: https://img.shields.io/badge/jsdocs-reference-080f12?style=flat&colorA=080f12&colorB=1fa669
[jsdocs-href]: https://www.jsdocs.io/package/@leiwang2000/dsh-tweaks
