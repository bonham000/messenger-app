import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

export default class App extends React.Component {
  async componentDidMount() {
    await this.getMessages();
    const message = await this.postMessage();
    await this.editMessage({
      ...message,
      message: "Hello, I'm Ryan!!!",
    });
    await this.getMessages();
    await this.deleteMessage(message.id);
    await this.getMessages();
  }
  render() {
    return (
      <View style={styles.container}>
        <Text>Open up App.js to start working on your app!</Text>
      </View>
    );
  }

  getMessages = async () => {
    try {
      console.log("\n");
      console.log("Getting messages...");
      const result = await fetch("http://localhost:8000/messages", {
        method: "GET",
      });
      const response = await result.json();
      console.log(response);
      console.log(
        `Message history result received! ${response.length} total messages!`,
      );
    } catch (err) {
      console.log("Message get error:");
      console.log(err);
    }
  };

  postMessage = async () => {
    try {
      const data = {
        message: `Hello from Earth -> ${Date.now()}`,
        author: "Seanie X",
      };

      console.log("\n");
      console.log("Posting message...");
      const result = await fetch("http://localhost:8000/message", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      const response = await result.json();
      console.log("Message post result:");
      console.log(response);
      return response;
    } catch (err) {
      console.log("Message post error:");
      console.log(err);
    }
  };

  editMessage = async (message: any) => {
    try {
      console.log("\n");
      console.log("Editing message...");
      const result = await fetch("http://localhost:8000/message", {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });
      const response = await result.json();
      console.log("Message edit result:");
      console.log(response);
    } catch (err) {
      console.log("Message edit error:");
      console.log(err);
    }
  };

  deleteMessage = async (id: number) => {
    try {
      console.log("\n");
      console.log("Deleting message...");
      const result = await fetch(`http://localhost:8000/message/${id}`, {
        method: "DELETE",
      });
      const response = await result.json();
      console.log("Message delete result:");
      console.log(response);
    } catch (err) {
      console.log("Message delete error:");
      console.log(err);
    }
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
