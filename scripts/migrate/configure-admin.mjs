// Sets how editors see each content type in the Content Manager: list
// columns, field order, labels and help text. Safe to re-run.
//
//   npm run migrate:admin
import { loadStrapi } from './lib/app.mjs';

const VIEWS = {
  'api::article.article': {
    settings: { mainField: 'title', defaultSortBy: 'publishedOn', defaultSortOrder: 'DESC', pageSize: 20 },
    list: ['title', 'section', 'author', 'publishedOn', 'needsReview'],
    edit: [
      [['title', 12]],
      [['kicker', 6], ['section', 6]],
      [['dek', 12]],
      [['body', 12]],
      [['cover', 12]],
      [['gallery', 12]],
      [['author', 6], ['publishedOn', 6]],
      [['slug', 6], ['videoUrl', 6]],
      [['quote', 12]],
      [['relatedLinks', 12]],
      [['seo', 12]],
      [['tags', 12]],
      [['needsReview', 6]],
    ],
    fields: {
      title: ['Headline', 'The headline readers see.'],
      kicker: ['Kicker', 'Small label above the headline, e.g. "Breaking" or "Miss Universe". Optional.'],
      section: ['Section', 'Where the story is filed on the site.'],
      tags: ['Tags', 'Pick any number. "Top story", "Headline" and "Most read" place the story in those homepage blocks; the newest tagged stories are shown.'],
      dek: ['Summary', 'One or two sentences shown under the headline and in story lists.'],
      body: ['Story', 'The full text. Use the image button to insert pictures from the Media Library.'],
      cover: ['Card picture', 'The thumbnail on news lists and when the story is shared. It is not shown on the story page.'],
      gallery: ['More pictures', 'Extra pictures kept with the story.'],
      author: ['Author', 'Who the byline credits.'],
      publishedOn: ['Date', 'The date shown on the story. Stories are listed newest first by this date.'],
      slug: ['Web address', 'The end of the story URL. Created from the headline; avoid changing it after publishing.'],
      videoUrl: ['Video link', 'A YouTube link to feature with the story. Optional.'],
      quote: ['Pull quote', 'A highlighted quote. Optional.'],
      relatedLinks: ['Related links', 'Links listed at the end of the story. Optional.'],
      seo: ['Search and sharing', 'Only fill this in to override the headline, summary or picture used by Google and social media.'],
      needsReview: ['Needs review', 'Ticked by the import when a story had a missing picture or an empty text. Untick once checked.'],
    },
  },
  'api::author.author': {
    settings: { mainField: 'name', defaultSortBy: 'name', defaultSortOrder: 'ASC' },
    list: ['name', 'slug'],
    edit: [[['name', 6], ['slug', 6]], [['photo', 6]], [['bio', 12]]],
    fields: {
      name: ['Name', 'As it should appear in bylines.'],
      slug: ['Web address', 'Created from the name.'],
      photo: ['Photo', 'Optional.'],
      bio: ['About', 'A short description. Optional.'],
    },
  },
  'api::redirect.redirect': {
    settings: { mainField: 'source', defaultSortBy: 'updatedAt', defaultSortOrder: 'DESC', pageSize: 50 },
    list: ['source', 'destination', 'updatedAt'],
    edit: [[['source', 12]], [['destination', 12]]],
    fields: {
      source: ['Source URL', 'The old address, starting with "/". Example: /news/Old-Headline/123'],
      destination: ['Destination URL', 'The new address visitors are sent to. Example: /news/new-headline'],
    },
  },
  'api::pageant.pageant': {
    settings: { mainField: 'name', defaultSortBy: 'name', defaultSortOrder: 'ASC', pageSize: 50 },
    list: ['name', 'tier', 'country', 'foundedYear'],
  },
  'api::edition.edition': {
    settings: { mainField: 'name', defaultSortBy: 'year', defaultSortOrder: 'DESC', pageSize: 50 },
    list: ['name', 'pageant', 'year', 'finalDate'],
  },
  'api::contestant.contestant': {
    settings: { mainField: 'name', defaultSortBy: 'name', defaultSortOrder: 'ASC', pageSize: 50 },
    list: ['name', 'country', 'age', 'heightCm'],
  },
  'api::edition-entry.edition-entry': {
    settings: { mainField: 'label', defaultSortBy: 'id', defaultSortOrder: 'DESC', pageSize: 50 },
    list: ['label', 'representing', 'placement', 'placementLabel'],
  },
  'api::photo-story.photo-story': {
    settings: { mainField: 'title', defaultSortBy: 'publishedOn', defaultSortOrder: 'DESC', pageSize: 50 },
    list: ['title', 'author', 'publishedOn'],
    fields: {
      title: ['Title', 'The album title readers see.'],
      dek: ['Summary', 'One or two sentences shown in album lists.'],
      cover: ['Cover picture', 'The picture shown in album lists. Usually the first picture of the album.'],
      frames: ['Pictures', 'The pictures in the order they are shown, each with a heading and caption.'],
      publishedOn: ['Date', 'Albums are listed newest first by this date.'],
      slug: ['Web address', 'The end of the album URL. Created from the title; avoid changing it after publishing.'],
    },
  },
  'api::poll.poll': {
    settings: { mainField: 'title', defaultSortBy: 'startDate', defaultSortOrder: 'DESC', pageSize: 50 },
    list: ['title', 'question', 'startDate', 'endDate'],
    fields: {
      title: ['Title', 'A short name for the poll. The web address is created from it.'],
      slug: ['Web address', 'The end of the poll URL, e.g. /Poll/this-part. Avoid changing it after publishing.'],
      question: ['Question', 'The question readers are asked.'],
      image: ['Picture', 'Shown beside the results.'],
      options: ['Answers', 'Each answer and the number of votes it has.'],
    },
  },
  'api::prediction-game.prediction-game': {
    settings: { mainField: 'title', defaultSortBy: 'closesOn', defaultSortOrder: 'DESC', pageSize: 50 },
    list: ['title', 'predict', 'closesOn', 'edition'],
    fields: {
      title: ['Title', 'Usually the pageant edition, e.g. Miss Earth 2019. The web address is created from it.'],
      slug: ['Web address', 'The end of the game URL, e.g. /Prediction-Game/this-part. Avoid changing it after publishing.'],
      predict: ['Predict', 'What readers predict, e.g. Top 5.'],
      picks: ['Number of picks', 'How many contestants a reader chooses.'],
      closesOn: ['Voting closes', 'The game is open until this date.'],
      stopped: ['Stopped', 'Tick to close the game early.'],
      readerPicks: ['Readers picks', 'How many readers picked each contestant, and how many picked her to win.'],
    },
  },
  'api::gallery-photo.gallery-photo': {
    settings: { mainField: 'category', defaultSortBy: 'postedOn', defaultSortOrder: 'DESC', pageSize: 50 },
    list: ['image', 'contestant', 'edition', 'category'],
    fields: {
      image: ['Photo', 'The picture.'],
      category: ['Category', 'How the photo is grouped on the contestant page, e.g. Evening Gown, Swim Suit, photoshoot.'],
      description: ['Caption', 'Shown under the photo. Optional.'],
      contestant: ['Contestant', 'Whose page the photo appears on.'],
      edition: ['Edition', 'The pageant edition the photo is from.'],
    },
  },
  'api::fashion-look.fashion-look': {
    settings: { mainField: 'title', defaultSortBy: 'order', defaultSortOrder: 'ASC', pageSize: 50 },
    list: ['title', 'wornBy', 'designer', 'pageant', 'order'],
    fields: {
      title: ['Gown or look', 'The name of the look, e.g. "The Queen of Gold".'],
      slug: ['Web address', 'The end of the page URL. Created from the name; avoid changing it after publishing.'],
      wornBy: ['Worn by', 'Who wore it.'],
      designer: ['Designer', 'Who made it.'],
      pageant: ['Pageant', 'The pageant the look belongs to.'],
      dek: ['Summary', 'One or two sentences shown in lists and under the title.'],
      image: ['Picture', 'A tall portrait works best.'],
      imageAlt: ['Picture description', 'Read out by screen readers. Describe what the picture shows.'],
      credit: ['Photo credit', 'Shown under the picture.'],
      body: ['Story', 'The full text.'],
      order: ['Order', 'Lower numbers come first. Number 1 leads the Fashion and Beauty block on the homepage.'],
    },
  },
  'api::exclusive-video.exclusive-video': {
    settings: { mainField: 'title', defaultSortBy: 'order', defaultSortOrder: 'ASC', pageSize: 50 },
    list: ['title', 'group', 'dateLabel', 'order'],
    fields: {
      title: ['Title', 'The video title readers see.'],
      group: ['Group', 'Which list the video appears in: Exclusive interview (the large carousel), Other interview or Final video.'],
      kicker: ['Label', 'Small label shown with the date, e.g. Exclusive, Interview, Final.'],
      dateLabel: ['Date or event', 'Shown beside the label, e.g. "11 July 2026" or "Miss World 2021".'],
      image: ['Picture', 'The poster shown before the video plays.'],
      videoFile: ['Video clip', 'Optional. A short clip that plays in place; without it the picture links out.'],
      link: ['Link', 'Where the video opens: the Instagram or YouTube address.'],
      order: ['Order', 'Lower numbers come first within the group.'],
    },
  },
  'api::page.page': {
    settings: { mainField: 'title', defaultSortBy: 'title', defaultSortOrder: 'ASC' },
    list: ['title', 'slug', 'updatedAt'],
    fields: {
      title: ['Title', 'The page heading.'],
      slug: ['Web address', 'The page URL, e.g. Contact-Us opens at /Contact-Us. Avoid changing it after publishing.'],
      section: ['Sections', 'The page from top to bottom. Each section has a slug the website uses to decide how to show it.'],
      seo: ['Search and sharing', 'Title, description, keywords and picture for Google and social media. Empty fields fall back to the page title and its opening text.'],
    },
  },
  'api::tag.tag': {
    settings: { mainField: 'name', defaultSortBy: 'name', defaultSortOrder: 'ASC' },
    list: ['name', 'slug', 'description'],
    fields: {
      name: ['Name', 'As editors see it when tagging a story.'],
      slug: ['Slug', 'Used by the website. Keep top-story, headline and most-read as they are: the homepage looks for them.'],
      description: ['Description', 'What the tag is for. Optional.'],
    },
  },
  'api::video.video': {
    settings: { mainField: 'title', defaultSortBy: 'publishedOn', defaultSortOrder: 'DESC', pageSize: 50 },
    list: ['title', 'edition', 'publishedOn', 'exclusive'],
    fields: {
      youtubeUrl: ['Video link', 'The YouTube (or Vimeo) address of the video.'],
      event: ['Part of the pageant', 'e.g. Finals, Preliminary, Swimsuit. Used by the filter on a pageant\'s video gallery.'],
    },
  },
  'api::country.country': {
    settings: { mainField: 'name', defaultSortBy: 'name', defaultSortOrder: 'ASC', pageSize: 50 },
    list: ['name', 'continent', 'iso2'],
  },
  'api::continent.continent': {
    settings: { mainField: 'name', defaultSortBy: 'order', defaultSortOrder: 'ASC' },
    list: ['name', 'order'],
  },
};

/**
 * The exact size an editor resizes each picture to before uploading it, shown in the field's
 * help text. Sizes follow the pictures the old site already holds and the shape the website
 * shows them in.
 */
const IMAGE_SIZES = {
  'api::article.article': {
    thumbnail: '800 × 640 px.',
    gallery: '810 × 540 px each.',
  },
  'api::author.author': { photo: '400 × 400 px.' },
  'api::contestant.contestant': { portrait: '720 × 864 px.' },
  'api::country.country': { flag: '60 × 40 px (PNG).' },
  'api::edition-entry.edition-entry': {
    portrait: '720 × 864 px.',
    winnerPhoto: '720 × 864 px.',
  },
  'api::edition.edition': { images: '810 × 540 px each.' },
  'api::pageant.pageant': {
    logo: '400 × 400 px (PNG with a transparent background).',
    images: '810 × 540 px each.',
  },
  'api::exclusive-video.exclusive-video': {
    image: '720 × 1280 px for an Exclusive interview or Final video, 1280 × 720 px for an Other interview.',
    videoFile: '720 × 1280 px (MP4, under 10 MB).',
  },
  'api::fashion-look.fashion-look': { image: '1080 × 1440 px.' },
  'api::gallery-photo.gallery-photo': { image: '640 × 960 px.' },
  'api::photo-story.photo-story': { cover: '750 × 500 px.' },
  'api::poll.poll': { image: '600 × 450 px.' },
  'api::prediction-game.prediction-game': { image: '800 × 600 px.' },
};
const COMPONENT_IMAGE_SIZES = {
  // The article "Card picture" and other captioned pictures.
  'shared.picture': { image: '810 × 540 px.' },
  'shared.frame': { image: '750 × 500 px.' },
  'shared.seo': { shareImage: '1200 × 630 px.' },
};
const SIZE_NOTE = 'Resize to ';

/** Puts the size note at the end of a field's help text, replacing any earlier note. */
function withSize(description, size) {
  const text = String(description ?? '').split(/Image size: |Resize to /)[0].trim();
  return `${text ? `${text} ` : ''}${SIZE_NOTE}${size}`;
}

const strapi = await loadStrapi();
try {
  const service = strapi.plugin('content-manager').service('content-types');
  for (const [uid, view] of Object.entries(VIEWS)) {
    const contentType = strapi.contentTypes[uid];
    const current = await service.findConfiguration(contentType);
    const metadatas = structuredClone(current.metadatas);
    for (const [field, [label, description]] of Object.entries(view.fields ?? {})) {
      metadatas[field].edit = { ...metadatas[field].edit, label, description };
      metadatas[field].list = { ...metadatas[field].list, label };
    }
    await service.updateConfiguration(contentType, {
      settings: { ...current.settings, ...view.settings },
      metadatas,
      layouts: {
        list: view.list,
        // Types without a hand-set form keep the editor's default field order.
        edit: view.edit ? view.edit.map((row) => row.map(([name, size]) => ({ name, size }))) : current.layouts.edit,
      },
    });
    console.log(`configured ${uid}`);
  }

  // Picture fields everywhere, including types and components without a hand-set form.
  for (const [uid, sizes] of Object.entries(IMAGE_SIZES)) {
    const contentType = strapi.contentTypes[uid];
    const current = await service.findConfiguration(contentType);
    const metadatas = structuredClone(current.metadatas);
    for (const [field, size] of Object.entries(sizes)) {
      metadatas[field].edit = { ...metadatas[field].edit, description: withSize(metadatas[field].edit?.description, size) };
    }
    await service.updateConfiguration(contentType, { settings: current.settings, metadatas, layouts: current.layouts });
    console.log(`image sizes ${uid}`);
  }
  const components = strapi.plugin('content-manager').service('components');
  for (const [uid, sizes] of Object.entries(COMPONENT_IMAGE_SIZES)) {
    const component = strapi.components[uid];
    const current = await components.findConfiguration(component);
    const metadatas = structuredClone(current.metadatas);
    for (const [field, size] of Object.entries(sizes)) {
      metadatas[field].edit = { ...metadatas[field].edit, description: withSize(metadatas[field].edit?.description, size) };
    }
    await components.updateConfiguration(component, { settings: current.settings, metadatas, layouts: current.layouts });
    console.log(`image sizes ${uid}`);
  }
} finally {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await strapi.destroy().catch((error) => console.warn(`Strapi shutdown: ${error.message}`));
}
process.exit(0);
