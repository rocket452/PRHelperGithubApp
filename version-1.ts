// index.js

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Ensure your API key is set in the environment variables
});

const BOT_NAME = "hello-world-app-probot[bot]";

export default (app) => {
  app.on("pull_request_review_comment.created", async (context) => {
    const comment = context.payload.comment;
    const pullRequest = context.payload.pull_request;
  
    console.log(`New PR comment created by ${comment.user.login}`);
    console.log(`Comment: ${comment.body}`);

      // Check if the comment was created by the bot itself
    if (comment.user.login === BOT_NAME) {
      console.log("Comment was created by the bot. Ignoring to prevent self-triggering.");
      return;
    }
    
    try {
      // Get the code snippet that was commented on
      const codeSnippet = await context.octokit.pulls.getReviewComment({
        owner: pullRequest.base.repo.owner.login,
        repo: pullRequest.base.repo.name,
        comment_id: comment.id,
      });
  
      // Prepare the messages for OpenAI
      const messages = [
        { role: "system", content: "You are a helpful assistant that suggests improvements to code based on comments." },
        { role: "user", content: `
  Given the following code snippet and comment, suggest how to fix or improve the code:
  
  Code:
  ${codeSnippet.data.diff_hunk}
  
  Comment:
  ${comment.body}
  
  Provide a concise suggestion for improving the code.`
        }
      ];
  
      // Call OpenAI API
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: messages,
        max_tokens: 150,
      });
  
      const suggestion = response.choices[0].message.content.trim();
  
      console.log("OpenAI Suggestion:", suggestion);
  
      // Post the suggestion as a reply to the comment
      // await context.octokit.pulls.createReplyForReviewComment({
      //   owner: pullRequest.base.repo.owner.login,
      //   repo: pullRequest.base.repo.name,
      //   pull_number: pullRequest.number,
      //   comment_id: comment.id,
      //   body: `Suggestion based on AI analysis:\n\n${suggestion}`,
      // });

  // Post the suggestion as a reply to the comment //WORKS
  await context.octokit.pulls.createReplyForReviewComment({
    owner: pullRequest.base.repo.owner.login,
    repo: pullRequest.base.repo.name,
    pull_number: pullRequest.number,
    comment_id: comment.id,
    body: `Suggestion based on AI analysis:\n\n${suggestion}`,
  });


  
      console.log("Suggestion posted as a reply to the comment");
    } catch (error) {
      console.error("Error processing PR comment:", error);
    }
  })
};