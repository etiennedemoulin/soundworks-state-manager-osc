// minimalistic, non subtle QoS
// to be improved little by little...
export default function initQoS(client, {
  // allow clients to choose which QoS strategy is applied
  visibilityChange = true,
} = {}) {
  // we don't want to disable this one
  client.socket.addListener('close', () => {
    setTimeout(() => window.location.reload(true), 2000);
  });

  // this is particularly boring with controllers
  if (visibilityChange) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        window.location.reload(true);
      }
    }, false);
  }
}
