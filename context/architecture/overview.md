# Architecture Overview

This project is a local AI harness with two main surfaces:

- a Bun-based CLI backend that owns websocket transport and OpenAI CLI bridging
- a React + TypeScript UI that handles chat interactions and model selection

The backend is the authority for request validation and command routing.
The UI is responsible for presenting state, collecting user input, and sending typed commands.

Conversation state is in-memory for the current process only.
No persistence layer is part of the MVP.

