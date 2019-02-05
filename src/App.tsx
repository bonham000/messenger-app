import React from "react";

import {
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const DEV_WEBSOCKET_URI = "ws://localhost:3012";
const PROD_WEBSOCKET_URI = "ws://shrouded-coast-91311.herokuapp.com:3012";
const DEV_URL = "http://localhost:8000/";
const PROD_URL = "https://shrouded-coast-91311.herokuapp.com";

// Un-comment for local development
const BACKED_URI = DEV_URL;
const WEBSOCKET_URI = DEV_WEBSOCKET_URI;

// Un-comment to enable Production backend
// const BACKED_URI = PROD_URL;
// const WEBSOCKET_URI = PROD_WEBSOCKET_URI;

interface Message {
  id: number;
  uuid: string;
  message: string;
  author: string;
}

interface IState {
  input: string;
  messages: ReadonlyArray<Message>;
}

export default class App extends React.Component<{}, IState> {
  socket: any;

  constructor(props: {}) {
    super(props);

    this.state = {
      input: "",
      messages: [],
    };
  }

  async componentDidMount() {
    // @ts-ignore
    this.socket = new WebSocket(WEBSOCKET_URI);

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
      this.handleSocketMessage(event.data);
    });

    this.getMessages();
  }

  render() {
    return (
      <View style={styles.container}>
        <Text style={{ margin: 20, fontSize: 18, fontWeight: "bold" }}>
          Message History:
        </Text>
        <FlatList
          data={this.state.messages.map(m => ({ message: m, key: m.uuid }))}
          renderItem={({ item }) => (
            <Text style={{ margin: 6 }} key={item.key}>
              {item.message.message}
            </Text>
          )}
        />
        <TextInput
          style={styles.textInput}
          placeholder="Type a new message"
          value={this.state.input}
          onChangeText={(text: string) => this.setState({ input: text })}
        />
        <Button onPress={this.postMessage} title="Send Message" />
      </View>
    );
  }

  handleSocketMessage = (data: any) => {
    console.log(`Socket data received: ${JSON.stringify(data)}`);
    /**
     * TODO: Add message locally, if it doesn't already exist
     */
  };

  broadcastMessage = (message: Message) => {
    this.socket.send(JSON.stringify(message));
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
      const message = {
        message: this.state.input,
        author: "Seanie X",
      };

      const result = await fetch(`${BACKED_URI}/message`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });
      const newMessage = await result.json();
      this.setState(
        prevState => ({
          input: "",
          messages: prevState.messages.concat(newMessage),
        }),
        () => {
          this.broadcastMessage(newMessage);
        },
      );
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
      /**
       * TODO: Update local state with result
       */
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
      /**
       * TODO: Remove message from local chat history
       */
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
    paddingTop: 75,
    paddingBottom: 45,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  textInput: {
    margin: 12,
    padding: 12,
    height: 40,
    width: "90%",
    borderWidth: 1,
    fontSize: 14,
    borderColor: "rgba(50,50,50,0.5)",
  },
});
