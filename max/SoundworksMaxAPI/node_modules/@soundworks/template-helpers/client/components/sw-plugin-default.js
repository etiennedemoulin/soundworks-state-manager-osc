import { LitElement, html, css } from 'lit-element';
import { classMap } from 'lit-html/directives/class-map.js';
import './sw-app-header.js';

class SwPluginDefault extends LitElement {
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
      }

      /* blinking animation */
      @-webkit-keyframes blink { 0% { opacity: .2; } 20% { opacity: 1; } 100% { opacity: .2; }}
      @-moz-keyframes blink { 0% { opacity: .2; } 20% { opacity: 1; } 100% { opacity: .2; }}
      @-ms-keyframes blink { 0% { opacity: .2; } 20% { opacity: 1; } 100% { opacity: .2; }}
      @-o-keyframes blink { 0% { opacity: .2; } 20% { opacity: 1; } 100% { opacity: .2; }}
      @keyframes blink { 0% { opacity: .2; } 20% { opacity: 1; } 100% { opacity: .2; }}


      li span {
        animation-name: blink;
        animation-duration: 1.4s;
        animation-iteration-count: infinite;
        animation-fill-mode: both;
      }

      li span:nth-child(2) {
        animation-delay: .2s;
      }

      li span:nth-child(3) {
        animation-delay: .4s;
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
            <li>
              Please wait while
              <span>.</span><span>.</span><span>.</span>
            </li>
            <slot></slot>
          </ul>
        </div>
      </section>
    `;
  }
}

customElements.define('sw-plugin-default', SwPluginDefault);
