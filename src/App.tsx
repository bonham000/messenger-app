import React from "react";

import { StyleSheet, Text, View } from "react-native";

const local = "ws://localhost:3012";
const dev = "http://localhost:8000/";
const URL = "https://shrouded-coast-91311.herokuapp.com";

const BACKED_URI = URL;

interface Message {
  id: number;
  uuid: string;
  message: string;
  author: string;
}

interface IState {
  messages: ReadonlyArray<Message>;
}

export default class App extends React.Component<{}, IState> {
  socket: any;

  constructor(props: {}) {
    super(props);

    this.state = {
      messages: [],
    };
  }

  async componentDidMount() {
    // @ts-ignore
    this.socket = new WebSocket(`ws://shrouded-coast-91311.herokuapp.com:3012`);

    // Open connection
    this.socket.addEventListener(
      "open",
      (_: any) => {
        console.log("Socket listener opened");
      },
      (error: any) => {
        console.log(`Error opening WebSockets listener: ${error}`);
      },
    );

    // Listen for messages
    this.socket.addEventListener("message", (event: any) => {
      this.handleSocketMessage(event);
    });

    this.getMessages();
  }
  render() {
    return (
      <View style={styles.container}>
        <Text>Message History:</Text>
      </View>
    );
  }

  handleSocketMessage = (message: any) => {
    console.log(`Socket data received: ${message}`);
  };

  getMessages = async () => {
    try {
      const result = await fetch(`${BACKED_URI}/messages`, {
        method: "GET",
      });
      const response = await result.json();
      this.setState({
        messages: response,
      });
    } catch (err) {
      this.handleError("GET", err);
    }
  };

  postMessage = async () => {
    try {
      const data = {
        message: `Hello from Earth -> ${Date.now()}`,
        author: "Seanie X",
      };

      const result = await fetch(`${BACKED_URI}/message`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      const response = await result.json();
      return response;
    } catch (err) {
      this.handleError("POST", err);
    }
  };

  editMessage = async (message: any) => {
    try {
      const result = await fetch(`${BACKED_URI}/message`, {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });
      const response = await result.json();
    } catch (err) {
      this.handleError("PUT", err);
    }
  };

  deleteMessage = async (id: number) => {
    try {
      const result = await fetch(`${BACKED_URI}/message/${id}`, {
        method: "DELETE",
      });
      const response = await result.json();
    } catch (err) {
      this.handleError("DELETE", err);
    }
  };

  handleError = (method: "GET" | "PUT" | "POST" | "DELETE", err: any) => {
    console.log(`Error for ${method} method: `, err);
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
