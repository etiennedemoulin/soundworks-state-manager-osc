import { LitElement, html, svg, css } from 'lit-element';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import '@ircam/simple-components/sc-dot-map.js';
import '@ircam/simple-components/sc-button.js';

class SwSPluginPosition extends LitElement {
  static get properties() {
    return {
      xRange: {
        type: Array,
        attribute: 'x-range',
      },
      yRange: {
        type: Array,
        attribute: 'y-range',
      },
      width: {
        type: Number
      },
      height: {
        type: Number
      },
      backgroundImage: {
        type: String,
        attribute: 'background-image',
      },
    }
  }

  static get styles() {
    return css`
      :host {
        display: block;
        position: relative;
      }

      .command-container {
        box-sizing: border-box;
        position: absolute;
        padding: 20px;
      }

      .placeholder {
        position: relative;
        top: 50%;
        margin-top: -20px;
      }

      .info {
        font-family: Consolas, monaco, monospace;
        color: white;
        font-size: 1.2rem;
        width: 100%;
        text-align: center;
        height: 36px;
        line-height: 36px;
      }
    `;
  }

  constructor() {
    super();

    this.x = null;
    this.y = null;
    this.backgroundImage = '';
  }

  render() {
    const orientation = this.width > this.height ? 'landscape' : 'portrait';
    const containerSize = orientation === 'portrait' ? this.width : this.height;

    // could be refined but does the job for now...
    let mapContainerWidth;
    let mapContainerHeight;
    let commandContainerWidth;
    let commandContainerHeight;
    let commandContainerTop;
    let commandContainerLeft;

    if (orientation === 'landscape') {
      commandContainerWidth = 300;
      commandContainerHeight = this.height;
      mapContainerWidth = this.width - commandContainerWidth;
      mapContainerHeight = this.height;
      commandContainerTop = 0;
      commandContainerLeft = mapContainerWidth;
    } else {
      commandContainerWidth = this.width;
      commandContainerHeight = 200;
      mapContainerWidth = this.width;
      mapContainerHeight = this.height - commandContainerHeight;
      commandContainerTop = mapContainerHeight;
      commandContainerLeft = 0;
    }

    return html`
      <sc-dot-map
        width="${mapContainerWidth}"
        height="${mapContainerHeight}"
        x-range="${JSON.stringify(this.xRange)}"
        y-range="${JSON.stringify(this.yRange)}"
        background-image="${this.backgroundImage}"
        radius="12"
        capture-events
        persist-events
        max-size="1"
        @input="${this.onUpdatePosition}"
      >
      </sc-dot-map>
      <section
        class="command-container"
        style="
          width: ${commandContainerWidth}px;
          height: ${commandContainerHeight}px;
          top: ${commandContainerTop}px;
          left: ${commandContainerLeft}px;
        "
      >
        <div class="placeholder">
          ${(this.x !== null && this.y !== null)
            ? html`
              <sc-button
                @input="${this.propagateChange}"
                value="Send"
                height="36"
                width="${commandContainerWidth - 40}"
              ></sc-button>`
            : html`
              <p class="info">
                Please, select your position
              </p>
            `
          }
        </div>
      </section>
    `;
  }

  onUpdatePosition(e) {
    const positions = e.detail.value;

    if (positions[0]) {
      // on first position change we want to display the send button
      const requestUpdate = (this.x === null && this.y === null) ? true : false;

      this.x = positions[0].x;
      this.y = positions[0].y;

      if (this.requestUpdate) {
        this.requestUpdate();
      }
    }
  }

  propagateChange(eventName) {
    const event = new CustomEvent('change', {
      detail: { x: this.x, y: this.y }
    });

    this.dispatchEvent(event);
  }
}

customElements.define('sw-plugin-position', SwSPluginPosition);
