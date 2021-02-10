import { LitElement, html, css } from 'lit-element';
import { classMap } from 'lit-html/directives/class-map.js';
import './sw-app-header.js';

class SwPluginError extends LitElement {
  static get properties() {
    return {
      title: {
        type: String,
        reflect: true,
      },
      subtitle: {
        type: String,
        reflect: true,
      },
    }
  }

  static get styles() {
    return css`
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }

      .half-screen {
        height: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .aligner-item-top {
        align-self: flex-start;
        width: 100%;
      }

      ul {
        list-style-type: none;
        padding-right: 20px;
      }

      li, ::slotted(li) {
        font-size: 1.4rem;
        line-height: 2rem;
        opacity: 0.6;
      }

      li:first-child {
        font-style: italic;
        opacity: 1;
        color: #a94442;
      }

    `;
  }

  constructor() {
    super();

    this.title = '';
    this.subtitle = '';
  }

  render() {
    return html`
      <section class="half-screen">
        <sw-app-header title="${this.title}" subtitle="${this.subtitle}" />
      </section>
      <section class="half-screen">
        <div class="aligner-item-top">
          <ul>
            <li>Sorry,</li>
            <slot name="message"></slot>
            <slot name="description"></slot>
          </ul>
        </div>
      </section>
    `;
  }
}

customElements.define('sw-plugin-error', SwPluginError);
