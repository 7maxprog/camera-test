export function getIceServers() {
  const servers = [{ urls: "stun:stun.l.google.com:19302" }];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

  if (turnUrl && turnUsername && turnCredential) {
    servers.push({
      urls: turnUrl,
      username: turnUsername,
      credential: turnCredential,
    });
  }

  return servers;
}

export function createPeerConnection() {
  return new RTCPeerConnection({
    iceServers: getIceServers(),
  });
}
