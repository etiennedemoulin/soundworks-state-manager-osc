import { html, render } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined';
import './components/sw-app-header.js';
import './components/sw-plugin-position.js';
import './components/sw-plugin-platform.js';
import './components/sw-plugin-default.js';
import './components/sw-plugin-error.js';

const startedMsg = {
  'audio-buffer-loader': (plugin) => 'Loading audio files',
  'sync': (plugin) => 'Syncing',
  'default': (plugin) => `Initializing ${plugin.name}`,
};

const errorMsg = {
  platform(plugin) {
    const pluginState = plugin.state.getValues();

    const stepErrors = {
      available: 'checking device compatibility',
      authorized: 'asking authorizations',
      initialized: 'initializing application',
      finalized: 'finalizing initialization',
    };

    // for testing...
    // pluginState['finalized'].result = false;
    // pluginState['finalized'].details['web-audio'] = false;

    let errorMsg;
    let erroredFeatures = [];

    // set error message and find more informations in [step].details
    for (let step of Object.keys(stepErrors)) {
      if (pluginState[step].result === false) { // this is the guilty one
        errorMsg = stepErrors[step];

        for (let feature in pluginState[step].details) {
          if (pluginState[step].details[feature] === false) {
            erroredFeatures.push(feature);
          }
        }

        break;
      }
    }

    return html`
      <li slot="message">An error occured while...</li>
      <li slot="description">${errorMsg} (${erroredFeatures.join(', ')})</li>
    `;
  },

  checkin(checkin) {
    return html`
      <li slot="message">No place available...</li>
      <li slot="description">Please try again later</li>
    `;

    return $html;
  },

  default(plugin) {
    return html`
      <li slot="message">An error occured while...</li>
      <li slot="description">Initializing ${plugin.name}</li>
    `;
  },
};

const renderScreen = {
  platform(platform, config, containerInfos) {
    const pluginState = platform.state.getValues();

    let msg;
    let bindListener = undefined;
    let blink = false;

    if (pluginState.available === null) {
      msg = 'Checkin...';
    } else if (pluginState.authorized === null) {
      msg = 'Authorizing...';
    } else if (pluginState.initializing === null) {
      msg = 'Please click to join';
      blink = true;

      bindListener = (e) => {
        e.preventDefault();
        platform.onUserGesture(e);
      }
    } else if (pluginState.initialized === null) {
      msg = 'Initializing...'
    } else if (pluginState.finalized === null) {
      msg = 'Finalizing...'
    }

    // @touchend="${ifDefined(bindListener)}"
    // @mouseup="${ifDefined(bindListener)}"

    return html`
      <sw-plugin-platform
        title="${config.app.name}"
        subtitle="${config.app.author}"
        msg="${msg}"
        ?blink="${blink}"
        @click="${ifDefined(bindListener)}"
      />
    `;
  },

  position(position, config, containerInfos) {
    const { xRange, yRange, backgroundImage } = position.options;

    const callback = (e) => {
      const { x, y } = e.detail;
      position.setPosition(x, y);
    };

    return html`
      <div class="screen">
        <sw-plugin-position
          x-range="${JSON.stringify(xRange)}"
          y-range="${JSON.stringify(yRange)}"
          @change="${callback}"
          width="${containerInfos.width}"
          height="${containerInfos.height}"
          background-image="${backgroundImage}"
        />
      </div>
    `;
  },

  default(plugins, config, containerInfos) {
    return html`
      <sw-plugin-default
        title="${config.app.name}"
        subtitle="${config.app.author}"
      >
        ${plugins.map(plugin => html`
          <li>
            ${startedMsg[plugin.name]
              ? startedMsg[plugin.name](plugin)
              : startedMsg.default(plugin)}
          </li>`
        )}
      </sw-plugin-default>
    `;
  },

  errored(plugin, config, containerInfos) {
    return html`
      <sw-plugin-error
        title="${config.app.name}"
        subtitle="${config.app.author}"
      >
        ${errorMsg[plugin.name] ? errorMsg[plugin.name](plugin) : errorMsg.default(plugin)}
      </sw-plugin-error>
    `;
  },
};

/**
 * This method only works with default plugin names (cf. `pluginFactory.defaultName`).
 * if other names are used, should be updated accordingly...
 */
export default function renderInitializationScreens(client, config, $container) {
  let currentStatus;
  let listenResize = false;

  const onResize = () => {
    renderScreenFromStatus(client, config, $container, currentStatus);
  };

  const unsubscribe = client.pluginManager.observe(status => {
    currentStatus = status;

    // wait for first status before adding resize listener
    if (!listenResize) {
      window.addEventListener('resize', onResize);
      listenResize = true;
    }

    renderScreenFromStatus(client, config, $container, status);
  });

  function renderScreenFromStatus(client, config, $container, status) {
    const { width, height } = $container.getBoundingClientRect();

    // for testing...
    // if (status['platform'] === 'ready') {
    //   status['platform'] = 'errored';
    // }

    let $screen;
    // handle platform first
    if (status['platform'] && status['platform'] === 'started') {

      const platformService = client.pluginManager.get('platform');
      $screen = renderScreen.platform(platformService, config, { width, height });

    } else if (status['platform'] && status['platform'] === 'errored') {

      const platformService = client.pluginManager.get('platform');
      $screen = renderScreen.errored(platformService, config, { width, height });

    // then every one else...
    } else if (status['position'] && status['position'] === 'started') {

      const positionService = client.pluginManager.get('position');
      $screen = renderScreen.position(positionService, config, { width, height });

    } else {
      // platform is ready, or not platform at all...
      const started = [];
      let errored = null; // only one plugin can be errored at once (normally)

      for (let key in status) {
        const plugin = client.pluginManager.get(key);

        // we ignore ready and idle plugins
        if (status[key] === 'started') {
          started.push(plugin);
        } else if (status[key] === 'errored') {
          errored = plugin;
        }
      }

      if (errored) {
        $screen = renderScreen.errored(errored, config, { width, height });
      } else {
        $screen = renderScreen.default(started, config, { width, height });
      }
    }

    render($screen, $container);
  }
  // clean when ready...
  client.pluginManager.ready.then(() => {
    window.removeEventListener('resize', onResize);
    unsubscribe();
  });
}

