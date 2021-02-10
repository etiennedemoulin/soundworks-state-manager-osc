import { LitElement, html, css } from 'lit-element';
import { classMap } from 'lit-html/directives/class-map.js';

class SwPluginPlatform extends LitElement {
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
      msg: {
        type: String,
        reflect: true,
      },
      blink: {
        type: Boolean,
        reflect: true,
      },
    };
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

      .normal {
        font-size: 1.4rem;
        line-height: 2rem;
      }

      /* blink softly */
      @-webkit-keyframes regular-soft-blink{0%{opacity:1.0}50%{opacity:0.3}100%{opacity:1.0}}
      @-moz-keyframes regular-soft-blink{0%{opacity:1.0}50%{opacity:0.3}100%{opacity:1.0}}
      @-ms-keyframes regular-soft-blink{0%{opacity:1.0}50%{opacity:0.3}100%{opacity:1.0}}
      @-o-keyframes regular-soft-blink{0%{opacity:1.0}50%{opacity:0.3}100%{opacity:1.0}}
      @keyframes regular-soft-blink{0%{opacity:1.0}50%{opacity:0.3}100%{opacity:1.0}}

      .soft-blink{
        -webkit-animation:regular-soft-blink 3.6s ease-in-out infinite;
        -moz-animation:regular-soft-blink 3.6s ease-in-out infinite;
        -ms-animation:regular-soft-blink 3.6s ease-in-out infinite;
        -o-animation:regular-soft-blink 3.6s ease-in-out infinite;
        animation:regular-soft-blink 3.6s ease-in-out infinite
      }
    `;
  }

  constructor() {
    super();

    this.title = '';
    this.subtitle = '';
    this.msg = '';
    this.blink = false;
  }

  render() {
    const messageClasses = {
      'normal': true,
      'align-center': true,
      'soft-blink': this.blink,
    };

    return html`
      <section class="half-screen">
        <sw-app-header title="${this.title}" subtitle="${this.subtitle}" />
      </section>
      <section class="half-screen">
        <p class="${classMap(messageClasses)}">${this.msg}</p>
      </section>
    `;
  }
}

customElements.define('sw-plugin-platform', SwPluginPlatform);
