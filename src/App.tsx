import React from "react";

import {
  Alert,
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
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
  editingMessage: boolean;
  editMessageData?: Message;
  messages: ReadonlyArray<Message>;
}

const HTTP = {
  GET: { method: "GET" },
  PUT: { method: "PUT" },
  POST: { method: "POST" },
  DELETE: { method: "DELETE" },
};

export default class App extends React.Component<{}, IState> {
  socket: any;

  constructor(props: {}) {
    super(props);

    this.state = {
      input: "",
      messages: [],
      editingMessage: false,
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
          contentContainerStyle={{ width: "100%" }}
          data={this.state.messages.map(m => ({ message: m, key: m.uuid }))}
          renderItem={({ item }) => {
            const { message } = item;
            return (
              <TouchableOpacity
                onPress={this.handleTapMessage(message)}
                style={{ width: "100%", marginTop: 7, marginBottom: 7 }}
              >
                <Text style={{ fontWeight: "bold" }} key={item.key}>
                  {message.author}:{" "}
                  <Text style={{ fontWeight: "normal" }} key={item.key}>
                    {message.message}
                  </Text>
                </Text>
              </TouchableOpacity>
            );
          }}
        />
        <TextInput
          style={styles.textInput}
          placeholder="Type a new message"
          value={this.state.input}
          onChangeText={(text: string) => this.setState({ input: text })}
        />
        <Button
          onPress={
            this.state.editingMessage ? this.editMessage : this.postMessage
          }
          title={`${this.state.editingMessage ? "Edit" : "Send"} Message`}
        />
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
    const data = JSON.stringify(message);
    console.log("Broadcasting message... ", data);
    this.socket.send(data);
  };

  getMessages = async () => {
    try {
      const result = await fetch(`${BACKED_URI}/messages`, HTTP.GET);
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
        ...HTTP.POST,
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

  editMessage = async () => {
    try {
      const message = {
        ...this.state.editMessageData,
        message: this.state.input,
        author: "Seanie X",
      };
      const result = await fetch(`${BACKED_URI}/message`, {
        ...HTTP.PUT,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });
      const response = await result.json();
      this.setState(
        prevState => ({
          input: "",
          editingMessage: false,
          editMessageData: undefined,
          messages: prevState.messages.map(m => {
            return m.id === response.id ? response : m;
          }),
        }),
        () => {
          /**
           * TODO: Handle broadcasting edit update
           */
        },
      );
    } catch (err) {
      this.handleError("PUT", err);
    }
  };

  deleteMessage = async (id: number) => {
    try {
      await fetch(`${BACKED_URI}/message/${id}`, HTTP.DELETE);
      this.setState(
        prevState => ({
          input: "",
          messages: prevState.messages.filter(m => m.id !== id),
        }),
        () => {
          /**
           * TODO: Handle broadcasting delete update
           */
        },
      );
    } catch (err) {
      this.handleError("DELETE", err);
    }
  };

  handleError = (method: "GET" | "PUT" | "POST" | "DELETE", err: any) => {
    console.log(`Error for ${method} method: `, err);
  };

  handleTapMessage = (message: Message) => () => {
    Alert.alert(
      "Options",
      "You can edit or delete",
      [
        {
          text: "Edit",
          style: "cancel",
          onPress: () => {
            this.setState({
              editingMessage: true,
              editMessageData: message,
              input: message.message,
            });
          },
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => this.deleteMessage(message.id),
        },
        {
          text: "Dismiss",
        },
      ],
      { cancelable: false },
    );
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
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
