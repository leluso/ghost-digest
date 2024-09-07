import showdown from "showdown";
import moment from "moment-timezone";
import * as core from "@actions/core";
import { TSGhostAdminAPI, Post } from "@ts-ghost/admin-api";

const ghostUrl = core.getInput("url");
const period = core.getInput("period");
const debug = core.getInput("debug").toLowerCase() === "true";
const tags = core.getInput("tags") || "Digest";
const excludedTagsInput = core.getInput("excluded_tags");
const excludedTags = excludedTagsInput.split(",").map((tag) => tag.trim());
core.debug(`Excluded tags: ${excludedTags.join(", ")}`);
const timezone = core.getInput("timezone") || "America/Chicago";
const title =
  core.getInput("title") ||
  `${period.charAt(0).toUpperCase() + period.slice(1)} Digest`;
const fullArticle = core.getInput("full_article").toLowerCase() === "true";

function isPeriod(period: string): boolean {
  return period.toLowerCase() === "daily" || period.toLowerCase() === "weekly";
}

async function fetchPosts(api: TSGhostAdminAPI) {
  try {
    if (debug) core.debug("Fetching posts from Ghost API...");
    let posts = await api.posts
      .browse({
        limit: 200,
        order: "published_at DESC",
      })
      .fetch();

    if (posts.success) {
      if (debug) {
        core.debug(`Fetched ${posts.data.length} posts from Ghost API.`);
      }

      return posts.data;
    } else {
      core.setFailed(
        `Failed to fetch posts from Ghost API: ${
          posts.errors.length > 0 ? posts.errors.join(",") : "Unknown error"
        }`,
      );
      return [];
    }
  } catch (error) {
    core.setFailed(`Failed to fetch posts from Ghost API: ${error}`);
    return [];
  }
}

function generateMarkdownDigest(posts: Post[], period: string) {
  if (debug)
    core.debug(`Generating ${period} digest for ${posts.length} posts.`);
  let markdown = "";

  posts.forEach((post) => {
    if (debug) {
      core.debug(
        `Processing post: ${post.title} with tags ${(post.tags || []).map(({ name }) => name).join(",")}`,
      );
    }
    markdown += `## ${post.title}\n`;
    markdown += `**Date:** ${moment(post.published_at).format("YYYY-MM-DD")}\n\n`;

    let imageUrl = post.feature_image ? post.feature_image : null;
    if (imageUrl) markdown += `![Image](${imageUrl})\n\n`;

    if (fullArticle) {
      markdown += `${post.html}\n\n`;
      markdown += `[View article](${post.url})\n\n`;
    } else {
      markdown += `${post.excerpt}...\n\n`;
      markdown += `[Read more](${post.url})\n\n`;
    }
  });

  return markdown;
}

async function generateDigests(
  startDate: string,
  period: string,
  api: TSGhostAdminAPI,
) {
  if (debug)
    core.debug(`Generating ${period} digest starting from ${startDate}.`);

  // Determine the end date based on the period
  let start, end;

  if (period.toLowerCase() === "weekly") {
    start = moment.tz(startDate, "YYYY-MM-DD", timezone).startOf("day");
    start = moment(startDate).subtract(1, "week").add(1, "day");
    end = moment(start).add(1, "week");
  } else {
    start = moment.tz(startDate, "YYYY-MM-DD", timezone).startOf("day");
    end = moment(start).add(1, "day");
  }

  end.set({ hour: 0, minute: 0, second: 0, millisecond: 0 });

  if (debug)
    core.debug(`Date range: ${start.toISOString()} to ${end.toISOString()}`);

  let posts = await fetchPosts(api);
  let filteredPosts = posts.filter((post) => {
    let pubDate = moment(post.published_at).tz(timezone).startOf("day");
    return pubDate.isSameOrAfter(start) && pubDate.isBefore(end);
  });

  if (debug) {
    posts.forEach((post) =>
      core.debug(
        `Post ${post.title} with tags ${(post.tags || []).map(({ name }) => name).join(",")}`,
      ),
    );
  }

  filteredPosts = filteredPosts.filter(
    (post) =>
      post.tags == null ||
      post.tags.every((postTag) => !excludedTags.includes(postTag.name)),
  );

  // sort by published_at asc
  filteredPosts.sort((a, b) =>
    moment(a.published_at).isAfter(moment(b.published_at)) ? 1 : -1,
  );

  if (debug)
    core.debug(
      `Filtered ${filteredPosts.length} posts for the ${period} digest.`,
    );

  let formattedDate;
  if (period.toLowerCase() === "weekly") {
    formattedDate = `${start.format("M/D")} - ${moment(start).add(6, "days").format("M/D")}`; // Weekly date range
  } else {
    formattedDate = `${start.format("M/D")}`; // Daily date
  }

  let markdownDigest = generateMarkdownDigest(filteredPosts, period);
  let converter = new showdown.Converter();
  let htmlDigest = converter.makeHtml(markdownDigest);

  try {
    if (debug)
      core.debug(`Creating newsletter post... ${period} ${formattedDate}`);

    let response = await api.posts.add(
      {
        title: `${title} (${formattedDate})`,
        html: htmlDigest,
        tags: tags.split(",").map((tag) => ({ name: tag.trim() })), // Convert comma-separated tags to array
        status: "draft",
      },
      {
        source: "html",
      },
    );
    if (response.success) {
      core.setOutput(
        "result",
        `Newsletter post created: ${response.data.slug}`,
      );
    } else {
      core.setFailed(
        `Failed to create newsletter post: ${
          response.errors.length > 0
            ? response.errors.join(",")
            : "Unknown error"
        }`,
      );
    }
  } catch (error) {
    core.setFailed(`Failed to create newsletter post: ${error}`);
  }
}

export async function run() {
  // Initialize Ghost Admin API
  const api = new TSGhostAdminAPI(ghostUrl, process.env.GHOST_API_KEY!, "v5.0");

  try {
    let startDate: string;
    if (isPeriod(period)) {
      startDate = moment().tz(timezone).format("YYYY-MM-DD");
    } else {
      if (period.match(/^\d{4}-\d{2}-\d{2}$/)) {
        startDate = period; // Use provided date
      }
      core.setFailed(`Invalid date format: ${period}`);
      return;
    }

    if (!isPeriod(period) && !startDate) {
      core.setFailed(
        "Please provide a period (Daily or Weekly) or a start date.",
      );
      return;
    }

    if (debug)
      core.debug(
        `Starting digest generation with startDate: ${startDate} and period: ${period}`,
      );
    await generateDigests(startDate, period, api);
  } catch (error) {
    core.setFailed(`Action failed with error: ${error}`);
  }
}

await run();
