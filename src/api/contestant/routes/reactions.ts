// Visitors' likes, dislikes, loves and flowers. Called only by the website's own server, which
// passes the visitor's click on with its STATIC_POST_TOKEN (see the route's auth scope).
export default {
  routes: [
    {
      method: 'POST',
      path: '/contestants/:documentId/reactions',
      handler: 'api::contestant.reactions.react',
      // Only a token allowed to update contestants (the site's STATIC_POST_TOKEN) may call this.
      config: { auth: { scope: ['api::contestant.contestant.update'] } },
    },
  ],
};
