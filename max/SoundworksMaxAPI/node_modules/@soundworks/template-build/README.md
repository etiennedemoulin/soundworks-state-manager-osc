# `@soundworks/template-build`

> `soundworks-template` build scripts for [soundworks#v3](https://github.com/collective-soundworks/soundworks)
>
> uses:
> - `babel` to transpile source files
> - `webpack` to bundle browser clients
> - `chokidar` for file watching

## Install

```
soundworks-template-build
```

## Usage

```
soundworks-template-build --build [--watch]
soundworks-template-build --minify
soundworks-template-build --watch-process <processName>
```

## Notes

Should support iOS >= 9

> browserlist: 'ios >= 9, not ie 11, not op_mini all'

## Todos

- build tow clients using a module / nomodule strategy
(cf [https://philipwalton.com/articles/using-native-javascript-modules-in-production-today/](https://philipwalton.com/articles/using-native-javascript-modules-in-production-today/))
- `vue.js` and `react` support

## License

BSD-3-Clause
