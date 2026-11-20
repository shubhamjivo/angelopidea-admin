// Readers' ballots for an open prediction game. Called only by the website's own server, which
// passes each ballot on with its STATIC_POST_TOKEN (see the route's auth scope).
export default {
  routes: [
    {
      method: 'POST',
      path: '/prediction-games/:documentId/ballots',
      handler: 'api::prediction-game.ballots.submit',
      // Only a token allowed to update prediction games (the site's STATIC_POST_TOKEN) may call this.
      config: { auth: { scope: ['api::prediction-game.prediction-game.update'] } },
    },
  ],
};
