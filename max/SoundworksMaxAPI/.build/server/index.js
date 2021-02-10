"use strict";

require("source-map-support/register");

var _server = require("@soundworks/core/server");

var _path = _interopRequireDefault(require("path"));

var _serveStatic = _interopRequireDefault(require("serve-static"));

var _templateLiteral = _interopRequireDefault(require("template-literal"));

var _PlayerExperience = _interopRequireDefault(require("./PlayerExperience.js"));

var _ControllerExperience = _interopRequireDefault(require("./ControllerExperience.js"));

var _nodeOsc = require("node-osc");

var _globals = _interopRequireDefault(require("./schemas/globals.js"));

var _other = _interopRequireDefault(require("./schemas/other.js"));

var _getConfig = _interopRequireDefault(require("./utils/getConfig.js"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// import osc from 'osc';
const ENV = process.env.ENV || 'default';
const config = (0, _getConfig.default)(ENV);
const server = new _server.Server(); // html template and static files (in most case, this should not be modified)

server.templateEngine = {
  compile: _templateLiteral.default
};
server.templateDirectory = _path.default.join('.build', 'server', 'tmpl');
server.router.use((0, _serveStatic.default)('public'));
server.router.use('build', (0, _serveStatic.default)(_path.default.join('.build', 'public')));
server.router.use('vendors', (0, _serveStatic.default)(_path.default.join('.vendors', 'public')));
console.log(`
--------------------------------------------------------
- launching "${config.app.name}" in "${ENV}" environment
- [pid: ${process.pid}]
--------------------------------------------------------
`); // -------------------------------------------------------------------
// register plugins
// -------------------------------------------------------------------
// server.pluginManager.register(pluginName, pluginFactory, [pluginOptions], [dependencies])
// -------------------------------------------------------------------
// register schemas
// -------------------------------------------------------------------

server.stateManager.registerSchema('globals', _globals.default);
server.stateManager.registerSchema('other', _other.default);

(async function launch() {
  try {
    // @todo - check how this behaves with a node client...
    await server.init(config, function (clientType, config, httpRequest) {
      return {
        clientType: clientType,
        app: {
          name: config.app.name,
          author: config.app.author
        },
        env: {
          type: config.env.type,
          websockets: config.env.websockets,
          assetsDomain: config.env.assetsDomain
        }
      };
    });
    const playerExperience = new _PlayerExperience.default(server, 'player');
    const controllerExperience = new _ControllerExperience.default(server, 'controller');
    const globals = await server.stateManager.create('globals'); // const globals2 = await server.stateManager.create('globals');

    let other = null;
    globals.subscribe(async function (updates) {
      if ('createOther' in updates) {
        if (updates.createOther) {
          other = await server.stateManager.create('other');
        } else {
          await other.detach();
        }
      }
    }); // start all the things

    await server.start();
    playerExperience.start();
    controllerExperience.start();
    const oscConfig = {
      localAddress: '0.0.0.0',
      // could be 0.0.0.0 by default
      localPort: 57121,
      remoteAddress: '127.0.0.1',
      remotePort: 57122
    };

    function coerseValue(key, value, def) {
      if (!def) {
        throw new Error(`Param "${key}" does not exists`);
      }

      switch (def.type) {
        case 'float':
          {
            const coersed = parseFloat(value);

            if (!Number.isNaN(coersed)) {
              return coersed;
            } else {
              if (def.nullable === true) {
                return null;
              } else {
                throw new Error(`Invalid value "${value}" for param "${key}"`);
              }
            }

            break;
          }

        case 'integer':
          {
            const coersed = parseInt(value);

            if (!Number.isNaN(coersed)) {
              return coersed;
            } else {
              if (def.nullable === true) {
                return null;
              } else {
                throw new Error(`Invalid value "${value}" for param "${key}"`);
              }
            }

            break;
          }

        case 'boolean':
          {
            return !!value;
            break;
          }

        case 'string':
          {
            return value + '';
            break;
          }

        case 'enum':
          {
            const list = def.list;

            if (list.indexOf(value) !== -1) {
              return list;
            } else {
              if (def.nullable === true) {
                return null;
              } else {
                throw new Error(`Invalid value "${value}" for param "${key}"`);
              }
            }

            break;
          }

        case 'any':
          {
            return value;
            break;
          }

        default:
          {
            return value;
            break;
          }
      } // return value;

    }

    class OscStateManager {
      constructor(config, stateManager) {
        this.config = config;
        this.stateManager = stateManager; // we keep a record of attached states, to send a notification to max
        // when the server exists

        this._attachedStates = new Map();
        this._listeners = new Map();
        this._observeListeners = new Map();
      }

      async init() {
        var _this = this;

        return new Promise(function (resolve, reject) {
          _this._oscClient = new _nodeOsc.Client(oscConfig.remoteAddress, oscConfig.remotePort);
          _this._oscServer = new _nodeOsc.Server(oscConfig.localPort, oscConfig.localAddress, function () {
            // allow Max to resend its observe requests when node wakes up
            console.log('sw.state-manager ready');

            _this._oscClient.send('/sw/state-manager/listening');

            resolve();
          }); // listen for incomming messages and dispatch

          _this._oscServer.on('message', function (msg) {
            const [channel, ...args] = msg;
            console.log('> OSC message:', channel, args);

            _this._emit(channel, args);
          }); // send detach messages to max when the server shuts down


          const cleanup = async function () {
            console.log('> cleanup...');

            for (let [schemaName, infos] of _this._attachedStates) {
              try {
                await infos.cleanStateFunc();
              } catch (err) {
                console.log(err);
              }
            }

            ;
            setTimeout(function () {
              console.log('> exiting...');
              process.exit();
            }, 0);
          };

          process.once('SIGINT', cleanup);
          process.once('beforeExit', cleanup); // we differ from JS API here
          // this should be one shot oeprations

          _this._subscribe('/sw/state-manager/observe-request', function (schemaName) {
            _this.stateManager.observe(function (_schemaName, stateId, nodeId) {
              // Max can only attach to states created by the server
              if (nodeId === -1) {
                if (_schemaName === schemaName) {
                  console.log(`send: '/sw/state-manager/observe-notification', ${schemaName}`);

                  _this._oscClient.send('/sw/state-manager/observe-notification', schemaName
                  /*, stateId */
                  );
                }
              }
            });
          }); // subscribe for `attach-request`s


          _this._subscribe('/sw/state-manager/attach-request', async function (schemaName, stateId) {
            // we don't allow Max to attach mode than once to a state
            if (_this._attachedStates.has(schemaName)) {
              const infos = _this._attachedStates.get(schemaName);

              await infos.cleanStateFunc();
            }

            let state;

            try {
              // @note - use soundworks behavior to find the first state of its kind
              state = await _this.stateManager.attach(schemaName
              /*, stateId */
              );
            } catch (err) {
              _this._oscClient.send('/sw/state-manager/attach-error', err);

              return;
            }

            const {
              id,
              remoteId
            } = state;
            const schema = state.getSchema();
            const updateChannel = `/sw/state-manager/update-request/${id}/${remoteId}`;

            const unsubscribeUpdateRequests = _this._subscribe(updateChannel, async function (updates) {
              updates = JSON.parse(updates);

              for (let key in updates) {
                try {
                  updates[key] = coerseValue(key, updates[key], schema[key]);
                } catch (err) {
                  console.log('Ignoring param update:', err.message);
                  delete updates[key];
                }
              }

              await state.set(updates);
            });

            const getValuesChannelRequest = `/sw/state-manager/get-values-request/${id}/${remoteId}`;
            const getValuesChannelResponse = `/sw/state-manager/get-values-response/${id}/${remoteId}`;

            const unsubscribeGetValues = _this._subscribe(getValuesChannelRequest, async function () {
              const values = JSON.stringify(state.getValues());

              _this._oscClient.send(getValuesChannelResponse, values);
            });

            const unsubscribeUpdateNotifications = state.subscribe(function (updates) {
              const channel = `/sw/state-manager/update-notification/${id}/${remoteId}`;
              updates = JSON.stringify(updates);

              _this._oscClient.send(channel, updates);
            });

            const cleanStateFunc = async function (detach = true) {
              console.log('cleaning state', schemaName, id, remoteId);
              unsubscribeUpdateRequests();
              unsubscribeGetValues();
              unsubscribeUpdateNotifications();
              unsubscribeDetach();
              const channel = `/sw/state-manager/detach-notification/${id}/${remoteId}`;

              _this._oscClient.send(channel); // notify max


              _this._attachedStates.delete(schemaName);

              if (detach) {
                await state.detach();
              }
            };

            const detachChannel = `/sw/state-manager/detach-request/${id}/${remoteId}`;

            const unsubscribeDetach = _this._subscribe(detachChannel, cleanStateFunc);

            state.onDetach(function () {
              return cleanStateFunc(false);
            });
            const schemaStr = JSON.stringify(schema);
            const currentValues = JSON.stringify(state.getValues());

            _this._attachedStates.set(schemaName, {
              state,
              cleanStateFunc
            });

            console.log(`[stateId: ${id} - remoteId: ${remoteId}] sending attach response`);

            _this._oscClient.send('/sw/state-manager/attach-response', id, remoteId, schemaName, schemaStr, currentValues);
          });
        });
      }

      _subscribe(channel, callback) {
        if (!this._listeners.has(channel)) {
          this._listeners.set(channel, new Set());
        }

        const listeners = this._listeners.get(channel);

        listeners.add(callback);
        return function () {
          return listeners.delete(callback);
        };
      }

      _emit(channel, args) {
        if (this._listeners.has(channel)) {
          const listeners = this._listeners.get(channel);

          listeners.forEach(function (callback) {
            return callback(...args);
          });
        }
      }

    }

    const oscStateManager = new OscStateManager(oscConfig, server.stateManager);
    await oscStateManager.init();
  } catch (err) {
    console.error(err.stack);
  }
})();

process.on('unhandledRejection', function (reason, p) {
  console.log(reason);
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImluZGV4LmpzIl0sIm5hbWVzIjpbIkVOViIsInByb2Nlc3MiLCJlbnYiLCJjb25maWciLCJzZXJ2ZXIiLCJTZXJ2ZXIiLCJ0ZW1wbGF0ZUVuZ2luZSIsImNvbXBpbGUiLCJ0ZW1wbGF0ZURpcmVjdG9yeSIsInBhdGgiLCJqb2luIiwicm91dGVyIiwidXNlIiwiY29uc29sZSIsImxvZyIsImFwcCIsIm5hbWUiLCJwaWQiLCJzdGF0ZU1hbmFnZXIiLCJyZWdpc3RlclNjaGVtYSIsImdsb2JhbHNTY2hlbWEiLCJvdGhlclNjaGVtYSIsImxhdW5jaCIsImluaXQiLCJjbGllbnRUeXBlIiwiaHR0cFJlcXVlc3QiLCJhdXRob3IiLCJ0eXBlIiwid2Vic29ja2V0cyIsImFzc2V0c0RvbWFpbiIsInBsYXllckV4cGVyaWVuY2UiLCJQbGF5ZXJFeHBlcmllbmNlIiwiY29udHJvbGxlckV4cGVyaWVuY2UiLCJDb250cm9sbGVyRXhwZXJpZW5jZSIsImdsb2JhbHMiLCJjcmVhdGUiLCJvdGhlciIsInN1YnNjcmliZSIsInVwZGF0ZXMiLCJjcmVhdGVPdGhlciIsImRldGFjaCIsInN0YXJ0Iiwib3NjQ29uZmlnIiwibG9jYWxBZGRyZXNzIiwibG9jYWxQb3J0IiwicmVtb3RlQWRkcmVzcyIsInJlbW90ZVBvcnQiLCJjb2Vyc2VWYWx1ZSIsImtleSIsInZhbHVlIiwiZGVmIiwiRXJyb3IiLCJjb2Vyc2VkIiwicGFyc2VGbG9hdCIsIk51bWJlciIsImlzTmFOIiwibnVsbGFibGUiLCJwYXJzZUludCIsImxpc3QiLCJpbmRleE9mIiwiT3NjU3RhdGVNYW5hZ2VyIiwiY29uc3RydWN0b3IiLCJfYXR0YWNoZWRTdGF0ZXMiLCJNYXAiLCJfbGlzdGVuZXJzIiwiX29ic2VydmVMaXN0ZW5lcnMiLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlamVjdCIsIl9vc2NDbGllbnQiLCJPc2NDbGllbnQiLCJfb3NjU2VydmVyIiwiT3NjU2VydmVyIiwic2VuZCIsIm9uIiwibXNnIiwiY2hhbm5lbCIsImFyZ3MiLCJfZW1pdCIsImNsZWFudXAiLCJzY2hlbWFOYW1lIiwiaW5mb3MiLCJjbGVhblN0YXRlRnVuYyIsImVyciIsInNldFRpbWVvdXQiLCJleGl0Iiwib25jZSIsIl9zdWJzY3JpYmUiLCJvYnNlcnZlIiwiX3NjaGVtYU5hbWUiLCJzdGF0ZUlkIiwibm9kZUlkIiwiaGFzIiwiZ2V0Iiwic3RhdGUiLCJhdHRhY2giLCJpZCIsInJlbW90ZUlkIiwic2NoZW1hIiwiZ2V0U2NoZW1hIiwidXBkYXRlQ2hhbm5lbCIsInVuc3Vic2NyaWJlVXBkYXRlUmVxdWVzdHMiLCJKU09OIiwicGFyc2UiLCJtZXNzYWdlIiwic2V0IiwiZ2V0VmFsdWVzQ2hhbm5lbFJlcXVlc3QiLCJnZXRWYWx1ZXNDaGFubmVsUmVzcG9uc2UiLCJ1bnN1YnNjcmliZUdldFZhbHVlcyIsInZhbHVlcyIsInN0cmluZ2lmeSIsImdldFZhbHVlcyIsInVuc3Vic2NyaWJlVXBkYXRlTm90aWZpY2F0aW9ucyIsInVuc3Vic2NyaWJlRGV0YWNoIiwiZGVsZXRlIiwiZGV0YWNoQ2hhbm5lbCIsIm9uRGV0YWNoIiwic2NoZW1hU3RyIiwiY3VycmVudFZhbHVlcyIsImNhbGxiYWNrIiwiU2V0IiwibGlzdGVuZXJzIiwiYWRkIiwiZm9yRWFjaCIsIm9zY1N0YXRlTWFuYWdlciIsImVycm9yIiwic3RhY2siLCJyZWFzb24iLCJwIl0sIm1hcHBpbmdzIjoiOztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUVBOztBQUNBOztBQUlBOztBQUVBOztBQUNBOztBQUVBOzs7O0FBUEE7QUFRQSxNQUFNQSxHQUFHLEdBQUdDLE9BQU8sQ0FBQ0MsR0FBUixDQUFZRixHQUFaLElBQW1CLFNBQS9CO0FBQ0EsTUFBTUcsTUFBTSxHQUFHLHdCQUFVSCxHQUFWLENBQWY7QUFDQSxNQUFNSSxNQUFNLEdBQUcsSUFBSUMsY0FBSixFQUFmLEMsQ0FFQTs7QUFDQUQsTUFBTSxDQUFDRSxjQUFQLEdBQXdCO0FBQUVDLEVBQUFBLE9BQU8sRUFBUEE7QUFB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QUFDcUQsTUFBRCxFQUFTQyxDQUFULEVBQWU7QUFDOUNuSCxFQUFBQSxPQUFPLENBQUNDLEdBQVIsQ0FBWWlILE1BQVo7QUFDRCxDQUZEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICdzb3VyY2UtbWFwLXN1cHBvcnQvcmVnaXN0ZXInO1xuaW1wb3J0IHsgU2VydmVyIH0gZnJvbSAnQHNvdW5kd29ya3MvY29yZS9zZXJ2ZXInO1xuaW1wb3J0IHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgc2VydmVTdGF0aWMgZnJvbSAnc2VydmUtc3RhdGljJztcbmltcG9ydCBjb21waWxlIGZyb20gJ3RlbXBsYXRlLWxpdGVyYWwnO1xuXG5pbXBvcnQgUGxheWVyRXhwZXJpZW5jZSBmcm9tICcuL1BsYXllckV4cGVyaWVuY2UuanMnO1xuaW1wb3J0IENvbnRyb2xsZXJFeHBlcmllbmNlIGZyb20gJy4vQ29udHJvbGxlckV4cGVyaWVuY2UuanMnO1xuXG4vLyBpbXBvcnQgb3NjIGZyb20gJ29zYyc7XG5cbmltcG9ydCB7IENsaWVudCBhcyBPc2NDbGllbnQsIFNlcnZlciBhcyBPc2NTZXJ2ZXIgfSBmcm9tICdub2RlLW9zYyc7XG5cbmltcG9ydCBnbG9iYWxzU2NoZW1hIGZyb20gJy4vc2NoZW1hcy9nbG9iYWxzLmpzJztcbmltcG9ydCBvdGhlclNjaGVtYSBmcm9tICcuL3NjaGVtYXMvb3RoZXIuanMnO1xuXG5pbXBvcnQgZ2V0Q29uZmlnIGZyb20gJy4vdXRpbHMvZ2V0Q29uZmlnLmpzJztcbmNvbnN0IEVOViA9IHByb2Nlc3MuZW52LkVOViB8fCAnZGVmYXVsdCc7XG5jb25zdCBjb25maWcgPSBnZXRDb25maWcoRU5WKTtcbmNvbnN0IHNlcnZlciA9IG5ldyBTZXJ2ZXIoKTtcblxuLy8gaHRtbCB0ZW1wbGF0ZSBhbmQgc3RhdGljIGZpbGVzIChpbiBtb3N0IGNhc2UsIHRoaXMgc2hvdWxkIG5vdCBiZSBtb2RpZmllZClcbnNlcnZlci50ZW1wbGF0ZUVuZ2luZSA9IHsgY29tcGlsZSB9O1xuc2VydmVyLnRlbXBsYXRlRGlyZWN0b3J5ID0gcGF0aC5qb2luKCcuYnVpbGQnLCAnc2VydmVyJywgJ3RtcGwnKTtcbnNlcnZlci5yb3V0ZXIudXNlKHNlcnZlU3RhdGljKCdwdWJsaWMnKSk7XG5zZXJ2ZXIucm91dGVyLnVzZSgnYnVpbGQnLCBzZXJ2ZVN0YXRpYyhwYXRoLmpvaW4oJy5idWlsZCcsICdwdWJsaWMnKSkpO1xuc2VydmVyLnJvdXRlci51c2UoJ3ZlbmRvcnMnLCBzZXJ2ZVN0YXRpYyhwYXRoLmpvaW4oJy52ZW5kb3JzJywgJ3B1YmxpYycpKSk7XG5cbmNvbnNvbGUubG9nKGBcbi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4tIGxhdW5jaGluZyBcIiR7Y29uZmlnLmFwcC5uYW1lfVwiIGluIFwiJHtFTlZ9XCIgZW52aXJvbm1lbnRcbi0gW3BpZDogJHtwcm9jZXNzLnBpZH1dXG4tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuYCk7XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIHJlZ2lzdGVyIHBsdWdpbnNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIHNlcnZlci5wbHVnaW5NYW5hZ2VyLnJlZ2lzdGVyKHBsdWdpbk5hbWUsIHBsdWdpbkZhY3RvcnksIFtwbHVnaW5PcHRpb25zXSwgW2RlcGVuZGVuY2llc10pXG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIHJlZ2lzdGVyIHNjaGVtYXNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbnNlcnZlci5zdGF0ZU1hbmFnZXIucmVnaXN0ZXJTY2hlbWEoJ2dsb2JhbHMnLCBnbG9iYWxzU2NoZW1hKTtcbnNlcnZlci5zdGF0ZU1hbmFnZXIucmVnaXN0ZXJTY2hlbWEoJ290aGVyJywgb3RoZXJTY2hlbWEpO1xuXG5cbihhc3luYyBmdW5jdGlvbiBsYXVuY2goKSB7XG4gIHRyeSB7XG4gICAgLy8gQHRvZG8gLSBjaGVjayBob3cgdGhpcyBiZWhhdmVzIHdpdGggYSBub2RlIGNsaWVudC4uLlxuICAgIGF3YWl0IHNlcnZlci5pbml0KGNvbmZpZywgKGNsaWVudFR5cGUsIGNvbmZpZywgaHR0cFJlcXVlc3QpID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNsaWVudFR5cGU6IGNsaWVudFR5cGUsXG4gICAgICAgIGFwcDoge1xuICAgICAgICAgIG5hbWU6IGNvbmZpZy5hcHAubmFtZSxcbiAgICAgICAgICBhdXRob3I6IGNvbmZpZy5hcHAuYXV0aG9yLFxuICAgICAgICB9LFxuICAgICAgICBlbnY6IHtcbiAgICAgICAgICB0eXBlOiBjb25maWcuZW52LnR5cGUsXG4gICAgICAgICAgd2Vic29ja2V0czogY29uZmlnLmVudi53ZWJzb2NrZXRzLFxuICAgICAgICAgIGFzc2V0c0RvbWFpbjogY29uZmlnLmVudi5hc3NldHNEb21haW4sXG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfSk7XG5cbiAgICBjb25zdCBwbGF5ZXJFeHBlcmllbmNlID0gbmV3IFBsYXllckV4cGVyaWVuY2Uoc2VydmVyLCAncGxheWVyJyk7XG4gICAgY29uc3QgY29udHJvbGxlckV4cGVyaWVuY2UgPSBuZXcgQ29udHJvbGxlckV4cGVyaWVuY2Uoc2VydmVyLCAnY29udHJvbGxlcicpO1xuXG4gICAgY29uc3QgZ2xvYmFscyA9IGF3YWl0IHNlcnZlci5zdGF0ZU1hbmFnZXIuY3JlYXRlKCdnbG9iYWxzJyk7XG4gICAgLy8gY29uc3QgZ2xvYmFsczIgPSBhd2FpdCBzZXJ2ZXIuc3RhdGVNYW5hZ2VyLmNyZWF0ZSgnZ2xvYmFscycpO1xuXG4gICAgbGV0IG90aGVyID0gbnVsbDtcblxuICAgIGdsb2JhbHMuc3Vic2NyaWJlKGFzeW5jIHVwZGF0ZXMgPT4ge1xuICAgICAgaWYgKCdjcmVhdGVPdGhlcicgaW4gdXBkYXRlcykge1xuICAgICAgICBpZiAodXBkYXRlcy5jcmVhdGVPdGhlcikge1xuICAgICAgICAgIG90aGVyID0gYXdhaXQgc2VydmVyLnN0YXRlTWFuYWdlci5jcmVhdGUoJ290aGVyJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYXdhaXQgb3RoZXIuZGV0YWNoKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIHN0YXJ0IGFsbCB0aGUgdGhpbmdzXG4gICAgYXdhaXQgc2VydmVyLnN0YXJ0KCk7XG4gICAgcGxheWVyRXhwZXJpZW5jZS5zdGFydCgpO1xuICAgIGNvbnRyb2xsZXJFeHBlcmllbmNlLnN0YXJ0KCk7XG5cbiAgICBjb25zdCBvc2NDb25maWcgPSB7XG4gICAgICBsb2NhbEFkZHJlc3M6ICcwLjAuMC4wJywgLy8gY291bGQgYmUgMC4wLjAuMCBieSBkZWZhdWx0XG4gICAgICBsb2NhbFBvcnQ6IDU3MTIxLFxuICAgICAgcmVtb3RlQWRkcmVzczogJzEyNy4wLjAuMScsXG4gICAgICByZW1vdGVQb3J0OiA1NzEyMixcbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gY29lcnNlVmFsdWUoa2V5LCB2YWx1ZSwgZGVmKSB7XG4gICAgICBpZiAoIWRlZikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFBhcmFtIFwiJHtrZXl9XCIgZG9lcyBub3QgZXhpc3RzYCk7XG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAoZGVmLnR5cGUpIHtcbiAgICAgICAgY2FzZSAnZmxvYXQnOiB7XG4gICAgICAgICAgY29uc3QgY29lcnNlZCA9IHBhcnNlRmxvYXQodmFsdWUpO1xuXG4gICAgICAgICAgaWYgKCFOdW1iZXIuaXNOYU4oY29lcnNlZCkpIHtcbiAgICAgICAgICAgIHJldHVybiBjb2Vyc2VkO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoZGVmLm51bGxhYmxlID09PSB0cnVlKSB7XG4gICAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIHZhbHVlIFwiJHt2YWx1ZX1cIiBmb3IgcGFyYW0gXCIke2tleX1cImApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBjYXNlICdpbnRlZ2VyJzoge1xuICAgICAgICAgIGNvbnN0IGNvZXJzZWQgPSBwYXJzZUludCh2YWx1ZSk7XG5cbiAgICAgICAgICBpZiAoIU51bWJlci5pc05hTihjb2Vyc2VkKSkge1xuICAgICAgICAgICAgcmV0dXJuIGNvZXJzZWQ7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChkZWYubnVsbGFibGUgPT09IHRydWUpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgdmFsdWUgXCIke3ZhbHVlfVwiIGZvciBwYXJhbSBcIiR7a2V5fVwiYCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgJ2Jvb2xlYW4nOiB7XG4gICAgICAgICAgcmV0dXJuICEhdmFsdWU7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSAnc3RyaW5nJzoge1xuICAgICAgICAgIHJldHVybiB2YWx1ZSArICcnO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGNhc2UgJ2VudW0nOiB7XG4gICAgICAgICAgY29uc3QgbGlzdCA9IGRlZi5saXN0O1xuXG4gICAgICAgICAgaWYgKGxpc3QuaW5kZXhPZih2YWx1ZSkgIT09IC0xKSB7XG4gICAgICAgICAgICByZXR1cm4gbGlzdDtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGRlZi5udWxsYWJsZSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgSW52YWxpZCB2YWx1ZSBcIiR7dmFsdWV9XCIgZm9yIHBhcmFtIFwiJHtrZXl9XCJgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSAnYW55Jzoge1xuICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBkZWZhdWx0OiB7XG4gICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8vIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICBjbGFzcyBPc2NTdGF0ZU1hbmFnZXIge1xuICAgICAgY29uc3RydWN0b3IoY29uZmlnLCBzdGF0ZU1hbmFnZXIpIHtcbiAgICAgICAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gICAgICAgIHRoaXMuc3RhdGVNYW5hZ2VyID0gc3RhdGVNYW5hZ2VyO1xuXG4gICAgICAgIC8vIHdlIGtlZXAgYSByZWNvcmQgb2YgYXR0YWNoZWQgc3RhdGVzLCB0byBzZW5kIGEgbm90aWZpY2F0aW9uIHRvIG1heFxuICAgICAgICAvLyB3aGVuIHRoZSBzZXJ2ZXIgZXhpc3RzXG4gICAgICAgIHRoaXMuX2F0dGFjaGVkU3RhdGVzID0gbmV3IE1hcCgpO1xuICAgICAgICB0aGlzLl9saXN0ZW5lcnMgPSBuZXcgTWFwKCk7XG5cbiAgICAgICAgdGhpcy5fb2JzZXJ2ZUxpc3RlbmVycyA9IG5ldyBNYXAoKTtcbiAgICAgIH1cblxuICAgICAgYXN5bmMgaW5pdCgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICB0aGlzLl9vc2NDbGllbnQgPSBuZXcgT3NjQ2xpZW50KG9zY0NvbmZpZy5yZW1vdGVBZGRyZXNzLCBvc2NDb25maWcucmVtb3RlUG9ydCk7XG5cbiAgICAgICAgICB0aGlzLl9vc2NTZXJ2ZXIgPSBuZXcgT3NjU2VydmVyKG9zY0NvbmZpZy5sb2NhbFBvcnQsIG9zY0NvbmZpZy5sb2NhbEFkZHJlc3MsICgpID0+IHtcbiAgICAgICAgICAgIC8vIGFsbG93IE1heCB0byByZXNlbmQgaXRzIG9ic2VydmUgcmVxdWVzdHMgd2hlbiBub2RlIHdha2VzIHVwXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnc3cuc3RhdGUtbWFuYWdlciByZWFkeScpO1xuICAgICAgICAgICAgdGhpcy5fb3NjQ2xpZW50LnNlbmQoJy9zdy9zdGF0ZS1tYW5hZ2VyL2xpc3RlbmluZycpO1xuICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgLy8gbGlzdGVuIGZvciBpbmNvbW1pbmcgbWVzc2FnZXMgYW5kIGRpc3BhdGNoXG4gICAgICAgICAgdGhpcy5fb3NjU2VydmVyLm9uKCdtZXNzYWdlJywgbXNnID0+IHtcbiAgICAgICAgICAgIGNvbnN0IFtjaGFubmVsLCAuLi5hcmdzXSA9IG1zZztcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCc+IE9TQyBtZXNzYWdlOicsIGNoYW5uZWwsIGFyZ3MpO1xuICAgICAgICAgICAgdGhpcy5fZW1pdChjaGFubmVsLCBhcmdzKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIC8vIHNlbmQgZGV0YWNoIG1lc3NhZ2VzIHRvIG1heCB3aGVuIHRoZSBzZXJ2ZXIgc2h1dHMgZG93blxuICAgICAgICAgIGNvbnN0IGNsZWFudXAgPSBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnPiBjbGVhbnVwLi4uJyk7XG4gICAgICAgICAgICBmb3IgKGxldCBbc2NoZW1hTmFtZSwgaW5mb3NdIG9mIHRoaXMuX2F0dGFjaGVkU3RhdGVzKSB7XG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgaW5mb3MuY2xlYW5TdGF0ZUZ1bmMoKTtcbiAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coZXJyKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgIGNvbnNvbGUubG9nKCc+IGV4aXRpbmcuLi4nKTtcbiAgICAgICAgICAgICAgcHJvY2Vzcy5leGl0KCk7XG4gICAgICAgICAgICB9LCAwKTtcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgcHJvY2Vzcy5vbmNlKCdTSUdJTlQnLCBjbGVhbnVwKTtcbiAgICAgICAgICBwcm9jZXNzLm9uY2UoJ2JlZm9yZUV4aXQnLCBjbGVhbnVwKTtcblxuICAgICAgICAgIC8vIHdlIGRpZmZlciBmcm9tIEpTIEFQSSBoZXJlXG4gICAgICAgICAgLy8gdGhpcyBzaG91bGQgYmUgb25lIHNob3Qgb2VwcmF0aW9uc1xuICAgICAgICAgIHRoaXMuX3N1YnNjcmliZSgnL3N3L3N0YXRlLW1hbmFnZXIvb2JzZXJ2ZS1yZXF1ZXN0Jywgc2NoZW1hTmFtZSA9PiB7XG4gICAgICAgICAgICB0aGlzLnN0YXRlTWFuYWdlci5vYnNlcnZlKChfc2NoZW1hTmFtZSwgc3RhdGVJZCwgbm9kZUlkKSA9PiB7XG4gICAgICAgICAgICAgIC8vIE1heCBjYW4gb25seSBhdHRhY2ggdG8gc3RhdGVzIGNyZWF0ZWQgYnkgdGhlIHNlcnZlclxuICAgICAgICAgICAgICBpZiAobm9kZUlkID09PSAtMSkge1xuICAgICAgICAgICAgICAgIGlmIChfc2NoZW1hTmFtZSA9PT0gc2NoZW1hTmFtZSkge1xuICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYHNlbmQ6ICcvc3cvc3RhdGUtbWFuYWdlci9vYnNlcnZlLW5vdGlmaWNhdGlvbicsICR7c2NoZW1hTmFtZX1gKVxuICAgICAgICAgICAgICAgICAgdGhpcy5fb3NjQ2xpZW50LnNlbmQoJy9zdy9zdGF0ZS1tYW5hZ2VyL29ic2VydmUtbm90aWZpY2F0aW9uJywgc2NoZW1hTmFtZSAvKiwgc3RhdGVJZCAqLyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICAgIC8vIHN1YnNjcmliZSBmb3IgYGF0dGFjaC1yZXF1ZXN0YHNcbiAgICAgICAgICB0aGlzLl9zdWJzY3JpYmUoJy9zdy9zdGF0ZS1tYW5hZ2VyL2F0dGFjaC1yZXF1ZXN0JywgYXN5bmMgKHNjaGVtYU5hbWUsIHN0YXRlSWQpID0+IHtcbiAgICAgICAgICAgIC8vIHdlIGRvbid0IGFsbG93IE1heCB0byBhdHRhY2ggbW9kZSB0aGFuIG9uY2UgdG8gYSBzdGF0ZVxuICAgICAgICAgICAgaWYgKHRoaXMuX2F0dGFjaGVkU3RhdGVzLmhhcyhzY2hlbWFOYW1lKSkge1xuICAgICAgICAgICAgICBjb25zdCBpbmZvcyA9IHRoaXMuX2F0dGFjaGVkU3RhdGVzLmdldChzY2hlbWFOYW1lKTtcbiAgICAgICAgICAgICAgYXdhaXQgaW5mb3MuY2xlYW5TdGF0ZUZ1bmMoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbGV0IHN0YXRlO1xuXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAvLyBAbm90ZSAtIHVzZSBzb3VuZHdvcmtzIGJlaGF2aW9yIHRvIGZpbmQgdGhlIGZpcnN0IHN0YXRlIG9mIGl0cyBraW5kXG4gICAgICAgICAgICAgIHN0YXRlID0gYXdhaXQgdGhpcy5zdGF0ZU1hbmFnZXIuYXR0YWNoKHNjaGVtYU5hbWUvKiwgc3RhdGVJZCAqLyk7XG4gICAgICAgICAgICB9IGNhdGNoKGVycikge1xuICAgICAgICAgICAgICB0aGlzLl9vc2NDbGllbnQuc2VuZCgnL3N3L3N0YXRlLW1hbmFnZXIvYXR0YWNoLWVycm9yJywgZXJyKTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCB7IGlkLCByZW1vdGVJZCB9ID0gc3RhdGU7XG4gICAgICAgICAgICBjb25zdCBzY2hlbWEgPSBzdGF0ZS5nZXRTY2hlbWEoKTtcblxuICAgICAgICAgICAgY29uc3QgdXBkYXRlQ2hhbm5lbCA9IGAvc3cvc3RhdGUtbWFuYWdlci91cGRhdGUtcmVxdWVzdC8ke2lkfS8ke3JlbW90ZUlkfWA7XG4gICAgICAgICAgICBjb25zdCB1bnN1YnNjcmliZVVwZGF0ZVJlcXVlc3RzID0gdGhpcy5fc3Vic2NyaWJlKHVwZGF0ZUNoYW5uZWwsIGFzeW5jIHVwZGF0ZXMgPT4ge1xuICAgICAgICAgICAgICB1cGRhdGVzID0gSlNPTi5wYXJzZSh1cGRhdGVzKTtcblxuICAgICAgICAgICAgICBmb3IgKGxldCBrZXkgaW4gdXBkYXRlcykge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICB1cGRhdGVzW2tleV0gPSBjb2Vyc2VWYWx1ZShrZXksIHVwZGF0ZXNba2V5XSwgc2NoZW1hW2tleV0pXG4gICAgICAgICAgICAgICAgfSBjYXRjaChlcnIpIHtcbiAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdJZ25vcmluZyBwYXJhbSB1cGRhdGU6JywgZXJyLm1lc3NhZ2UpO1xuICAgICAgICAgICAgICAgICAgZGVsZXRlIHVwZGF0ZXNba2V5XTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBhd2FpdCBzdGF0ZS5zZXQodXBkYXRlcyk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29uc3QgZ2V0VmFsdWVzQ2hhbm5lbFJlcXVlc3QgPSBgL3N3L3N0YXRlLW1hbmFnZXIvZ2V0LXZhbHVlcy1yZXF1ZXN0LyR7aWR9LyR7cmVtb3RlSWR9YDtcbiAgICAgICAgICAgIGNvbnN0IGdldFZhbHVlc0NoYW5uZWxSZXNwb25zZSA9IGAvc3cvc3RhdGUtbWFuYWdlci9nZXQtdmFsdWVzLXJlc3BvbnNlLyR7aWR9LyR7cmVtb3RlSWR9YDtcbiAgICAgICAgICAgIGNvbnN0IHVuc3Vic2NyaWJlR2V0VmFsdWVzID0gdGhpcy5fc3Vic2NyaWJlKGdldFZhbHVlc0NoYW5uZWxSZXF1ZXN0LCBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IHZhbHVlcyA9IEpTT04uc3RyaW5naWZ5KHN0YXRlLmdldFZhbHVlcygpKTtcbiAgICAgICAgICAgICAgdGhpcy5fb3NjQ2xpZW50LnNlbmQoZ2V0VmFsdWVzQ2hhbm5lbFJlc3BvbnNlLCB2YWx1ZXMpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHVuc3Vic2NyaWJlVXBkYXRlTm90aWZpY2F0aW9ucyA9IHN0YXRlLnN1YnNjcmliZSh1cGRhdGVzID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgY2hhbm5lbCA9IGAvc3cvc3RhdGUtbWFuYWdlci91cGRhdGUtbm90aWZpY2F0aW9uLyR7aWR9LyR7cmVtb3RlSWR9YDtcblxuICAgICAgICAgICAgICB1cGRhdGVzID0gSlNPTi5zdHJpbmdpZnkodXBkYXRlcyk7XG4gICAgICAgICAgICAgIHRoaXMuX29zY0NsaWVudC5zZW5kKGNoYW5uZWwsIHVwZGF0ZXMpO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGNvbnN0IGNsZWFuU3RhdGVGdW5jID0gYXN5bmMgKGRldGFjaCA9IHRydWUpID0+IHtcbiAgICAgICAgICAgICAgY29uc29sZS5sb2coJ2NsZWFuaW5nIHN0YXRlJywgc2NoZW1hTmFtZSwgaWQsIHJlbW90ZUlkKTtcbiAgICAgICAgICAgICAgdW5zdWJzY3JpYmVVcGRhdGVSZXF1ZXN0cygpO1xuICAgICAgICAgICAgICB1bnN1YnNjcmliZUdldFZhbHVlcygpO1xuICAgICAgICAgICAgICB1bnN1YnNjcmliZVVwZGF0ZU5vdGlmaWNhdGlvbnMoKTtcbiAgICAgICAgICAgICAgdW5zdWJzY3JpYmVEZXRhY2goKTtcblxuICAgICAgICAgICAgICBjb25zdCBjaGFubmVsID0gYC9zdy9zdGF0ZS1tYW5hZ2VyL2RldGFjaC1ub3RpZmljYXRpb24vJHtpZH0vJHtyZW1vdGVJZH1gO1xuICAgICAgICAgICAgICB0aGlzLl9vc2NDbGllbnQuc2VuZChjaGFubmVsKTtcbiAgICAgICAgICAgICAgLy8gbm90aWZ5IG1heFxuICAgICAgICAgICAgICB0aGlzLl9hdHRhY2hlZFN0YXRlcy5kZWxldGUoc2NoZW1hTmFtZSk7XG5cbiAgICAgICAgICAgICAgaWYgKGRldGFjaCkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHN0YXRlLmRldGFjaCgpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGRldGFjaENoYW5uZWwgPSBgL3N3L3N0YXRlLW1hbmFnZXIvZGV0YWNoLXJlcXVlc3QvJHtpZH0vJHtyZW1vdGVJZH1gO1xuICAgICAgICAgICAgY29uc3QgdW5zdWJzY3JpYmVEZXRhY2ggPSB0aGlzLl9zdWJzY3JpYmUoZGV0YWNoQ2hhbm5lbCwgY2xlYW5TdGF0ZUZ1bmMpO1xuXG4gICAgICAgICAgICBzdGF0ZS5vbkRldGFjaCgoKSA9PiBjbGVhblN0YXRlRnVuYyhmYWxzZSkpO1xuXG4gICAgICAgICAgICBjb25zdCBzY2hlbWFTdHIgPSBKU09OLnN0cmluZ2lmeShzY2hlbWEpO1xuICAgICAgICAgICAgY29uc3QgY3VycmVudFZhbHVlcyA9IEpTT04uc3RyaW5naWZ5KHN0YXRlLmdldFZhbHVlcygpKTtcblxuICAgICAgICAgICAgdGhpcy5fYXR0YWNoZWRTdGF0ZXMuc2V0KHNjaGVtYU5hbWUsIHsgc3RhdGUsIGNsZWFuU3RhdGVGdW5jIH0pO1xuXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgW3N0YXRlSWQ6ICR7aWR9IC0gcmVtb3RlSWQ6ICR7cmVtb3RlSWR9XSBzZW5kaW5nIGF0dGFjaCByZXNwb25zZWApO1xuICAgICAgICAgICAgdGhpcy5fb3NjQ2xpZW50LnNlbmQoJy9zdy9zdGF0ZS1tYW5hZ2VyL2F0dGFjaC1yZXNwb25zZScsIGlkLCByZW1vdGVJZCwgc2NoZW1hTmFtZSwgc2NoZW1hU3RyLCBjdXJyZW50VmFsdWVzKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICB9XG5cbiAgICAgIF9zdWJzY3JpYmUoY2hhbm5lbCwgY2FsbGJhY2spIHtcbiAgICAgICAgaWYgKCF0aGlzLl9saXN0ZW5lcnMuaGFzKGNoYW5uZWwpKSB7XG4gICAgICAgICAgdGhpcy5fbGlzdGVuZXJzLnNldChjaGFubmVsLCBuZXcgU2V0KCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbGlzdGVuZXJzID0gdGhpcy5fbGlzdGVuZXJzLmdldChjaGFubmVsKTtcbiAgICAgICAgbGlzdGVuZXJzLmFkZChjYWxsYmFjayk7XG5cbiAgICAgICAgcmV0dXJuICgpID0+IGxpc3RlbmVycy5kZWxldGUoY2FsbGJhY2spO1xuICAgICAgfVxuXG4gICAgICBfZW1pdChjaGFubmVsLCBhcmdzKSB7XG4gICAgICAgIGlmICh0aGlzLl9saXN0ZW5lcnMuaGFzKGNoYW5uZWwpKSB7XG4gICAgICAgICAgY29uc3QgbGlzdGVuZXJzID0gdGhpcy5fbGlzdGVuZXJzLmdldChjaGFubmVsKTtcbiAgICAgICAgICBsaXN0ZW5lcnMuZm9yRWFjaChjYWxsYmFjayA9PiBjYWxsYmFjayguLi5hcmdzKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBvc2NTdGF0ZU1hbmFnZXIgPSBuZXcgT3NjU3RhdGVNYW5hZ2VyKG9zY0NvbmZpZywgc2VydmVyLnN0YXRlTWFuYWdlcik7XG4gICAgYXdhaXQgb3NjU3RhdGVNYW5hZ2VyLmluaXQoKTtcblxuICB9IGNhdGNoIChlcnIpIHtcbiAgICBjb25zb2xlLmVycm9yKGVyci5zdGFjayk7XG4gIH1cbn0pKCk7XG5cbnByb2Nlc3Mub24oJ3VuaGFuZGxlZFJlamVjdGlvbicsIChyZWFzb24sIHApID0+IHtcbiAgY29uc29sZS5sb2cocmVhc29uKTtcbn0pO1xuIl19