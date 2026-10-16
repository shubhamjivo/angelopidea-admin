import type { Schema, Struct } from '@strapi/strapi';

export interface PlayPollOption extends Struct.ComponentSchema {
  collectionName: 'components_play_poll_options';
  info: {
    description: 'One answer of a poll and the votes it received.';
    displayName: 'Poll option';
    icon: 'check';
  };
  attributes: {
    label: Schema.Attribute.String & Schema.Attribute.Required;
    votes: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
  };
}

export interface PlayReaderPick extends Struct.ComponentSchema {
  collectionName: 'components_play_reader_picks';
  info: {
    description: 'How many readers picked a contestant in a prediction game, and how many picked her to win.';
    displayName: 'Reader pick';
    icon: 'crown';
  };
  attributes: {
    contestant: Schema.Attribute.Relation<
      'oneToOne',
      'api::contestant.contestant'
    >;
    votes: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
    winnerVotes: Schema.Attribute.Integer & Schema.Attribute.DefaultTo<0>;
  };
}

export interface SectionsContent extends Struct.ComponentSchema {
  collectionName: 'components_sections_contents';
  info: {
    description: 'One section of a page. The slug tells the website which block shows it.';
    displayName: 'Content section';
    icon: 'layout';
  };
  attributes: {
    body: Schema.Attribute.RichText &
      Schema.Attribute.CustomField<
        'plugin::ckeditor5.CKEditor',
        {
          preset: 'defaultHtml';
        }
      >;
    slug: Schema.Attribute.String & Schema.Attribute.Required;
    title: Schema.Attribute.String;
  };
}

export interface SharedFrame extends Struct.ComponentSchema {
  collectionName: 'components_shared_frames';
  info: {
    description: 'One picture of a photo story, with its heading and caption.';
    displayName: 'Frame';
    icon: 'landscape';
  };
  attributes: {
    caption: Schema.Attribute.Text;
    image: Schema.Attribute.Media<'images'> & Schema.Attribute.Required;
    slug: Schema.Attribute.String;
    summary: Schema.Attribute.Text;
    title: Schema.Attribute.String;
  };
}

export interface SharedLink extends Struct.ComponentSchema {
  collectionName: 'components_shared_links';
  info: {
    description: 'A labelled link.';
    displayName: 'Link';
    icon: 'link';
  };
  attributes: {
    label: Schema.Attribute.String & Schema.Attribute.Required;
    url: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SharedPicture extends Struct.ComponentSchema {
  collectionName: 'components_shared_pictures';
  info: {
    description: 'An image with its caption and photo credit.';
    displayName: 'Picture';
    icon: 'picture';
  };
  attributes: {
    caption: Schema.Attribute.Text;
    credit: Schema.Attribute.String;
    image: Schema.Attribute.Media<'images'> & Schema.Attribute.Required;
  };
}

export interface SharedQuote extends Struct.ComponentSchema {
  collectionName: 'components_shared_quotes';
  info: {
    description: 'A pull quote and who said it.';
    displayName: 'Quote';
    icon: 'quote';
  };
  attributes: {
    credit: Schema.Attribute.String;
    text: Schema.Attribute.Text & Schema.Attribute.Required;
  };
}

export interface SharedSeo extends Struct.ComponentSchema {
  collectionName: 'components_shared_seos';
  info: {
    description: "Search and social sharing (Open Graph): the title, description, keywords and picture used by Google, Facebook and X. Empty fields fall back to the page's own title, summary and picture.";
    displayName: 'SEO';
    icon: 'search';
  };
  attributes: {
    keywords: Schema.Attribute.Text;
    metaDescription: Schema.Attribute.Text;
    metaTitle: Schema.Attribute.String;
    noIndex: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
    shareImage: Schema.Attribute.Media<'images'>;
  };
}

export interface SharedTitleAward extends Struct.ComponentSchema {
  collectionName: 'components_shared_title_awards';
  info: {
    description: 'A title or special award won at an edition.';
    displayName: 'Title or award';
    icon: 'crown';
  };
  attributes: {
    order: Schema.Attribute.Integer;
    title: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'play.poll-option': PlayPollOption;
      'play.reader-pick': PlayReaderPick;
      'sections.content': SectionsContent;
      'shared.frame': SharedFrame;
      'shared.link': SharedLink;
      'shared.picture': SharedPicture;
      'shared.quote': SharedQuote;
      'shared.seo': SharedSeo;
      'shared.title-award': SharedTitleAward;
    }
  }
}
