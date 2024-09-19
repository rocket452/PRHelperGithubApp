// index.js

import OpenAI from "openai";
import { WebClient } from "@slack/web-api";
const slackToken = process.env.SLACK_BOT_TOKEN;
const slackClient = new WebClient(slackToken);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Ensure your API key is set in the environment variables
});

export default (app) => {
  app.on("pull_request_review_comment.created", async (context) => {
    const comment = context.payload.comment;
    const pullRequest = context.payload.pull_request;

    // Get the bot's username
    const { data: appInfo } = await context.octokit.apps.getAuthenticated();
    const botLogin = "hello-world-app-probot[bot]";

    // Prevent the bot from triggering itself
    if (comment.user.login === botLogin) {
      console.log("Comment created by bot, skipping processing.");
      return;
    }

    console.log(`New PR comment created by ${comment.user.login}`);
    console.log(`Comment: ${comment.body}`);

    try {
      // Fetch the code snippet that was commented on
      const { data: codeSnippet } = await context.octokit.pulls.getReviewComment({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        comment_id: comment.id,
      });

      const aiSuggestion = getOpenAISuggestion(codeSnippet, comment, context);

      console.log("OpenAI Suggestion:", aiSuggestion);

      // Format the suggestion as a GitHub code suggestion
      const suggestionBody = `💡 **AI Suggestion**\n\n\`\`\`suggestion\n${aiSuggestion}\n\`\`\``;

      // Post the suggestion as a review comment
      await context.octokit.pulls.createReviewComment({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        pull_number: pullRequest.number,
        body: suggestionBody,
        commit_id: codeSnippet.commit_id,
        path: codeSnippet.path,
        side: codeSnippet.side || 'RIGHT',
        line: codeSnippet.original_line || codeSnippet.line,
      });

      console.log("Code suggestion posted as a review comment");

      const slackMessage = `Hi, your comment on PR #${pullRequest.number} has an AI-generated suggestion.\n\n${pullRequest.html_url}`;
      sendSlackMessage(slackMessage);

    } catch (error) {
      console.error("Error processing PR comment:", error);
    }
  });

  app.on('pull_request.synchronize', async (context) => {
    notifyPreviousApprovers(context);
  });

};

async function sendSlackMessage(slackMessage) {
  // Send a Slack message to the user
  const slackUserId = "U07N0CURUKU"; // Replace with the actual Slack user ID

  if (slackUserId) {
    try {
      // Send the Slack message
      await slackClient.chat.postMessage({
        channel: slackUserId,
        text: slackMessage,
      });

      console.log(`Slack message sent to user with Slack ID ${slackUserId}`);
    } catch (error) {
      console.error(`Failed to send Slack message: ${error.message}`);
    }
  } else {
    console.log('No Slack user ID provided.');
  }
}


  async function notifyPreviousApprovers(context){


    const pullRequest = context.payload.pull_request;
    const repo = context.payload.repository;

    console.log(`New commit pushed to PR #${pullRequest.number}`);

    // Step 1: Check if the PR was previously approved
    const reviews = await context.octokit.pulls.listReviews({
      owner: repo.owner.login,
      repo: repo.name,
      pull_number: pullRequest.number,
    });

    // Find the last user who approved the PR
    const approver = reviews.data.reverse().find(review => review.state === 'APPROVED');
    
    if (approver) {
      console.log(`PR was previously approved by ${approver.user.login}`);

      // Step 2: Check if the PR now requires re-approval (check mergeable state)
      const prDetails = await context.octokit.pulls.get({
        owner: repo.owner.login,
        repo: repo.name,
        pull_number: pullRequest.number,
      });

      if (prDetails.data.mergeable_state === 'dirty' || prDetails.data.mergeable_state === 'unstable') {
        console.log('PR requires re-approval.');

        const slackMessage = `Hi @${githubUsername}, your approval on PR #${pullRequest.number} has been invalidated by a new commit. Please re-approve.\n\nPR Link: ${pullRequest.html_url}`;

        // Step 3: Send a Slack notification to the previous approver
        await sendSlackMessage(slackMessage);
      }
    }
  };

 function getOpenAISuggestion(comment, codeSnippet, context){

    // Prepare the messages for OpenAI
    const messages = [
      {
        role: "system",
        content:
          "You are a helpful assistant that suggests code improvements based on review comments. Provide only the improved code without explanations.",
      },
      {
        role: "user",
        content: `
Given the following code snippet and comment, suggest an improved version of the code:

Code:
${codeSnippet.diff_hunk}

Comment:
${comment.body}

Provide only the improved code.`,
      },
    ];

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: messages,
      max_tokens: 150,
      temperature: 0.7,
    });

    return response.choices[0].message.content.trim();

}


