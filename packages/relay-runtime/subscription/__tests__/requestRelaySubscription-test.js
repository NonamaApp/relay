/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @flow
 * @emails oncall+relay
 */

'use strict';

const requestRelaySubscription = require('requestRelaySubscription');

const {createMockEnvironment} = require('RelayModernMockEnvironment');
const {createOperationSelector} = require('RelayModernOperationSelector');
const {generateAndCompile} = require('RelayModernTestUtils');
const {ROOT_ID} = require('RelayStoreUtils');

describe('requestRelaySubscription-test', () => {
  it('Config: `RANGE_ADD`', () => {
    const environment = createMockEnvironment();
    const store = environment.getStore();

    // write some data to the store
    const feedbackId = 'foo';
    const firstCommentId = 'comment-1';
    const firstCommentBody = 'first comment';
    const secondCommentId = 'comment-2';
    const {FeedbackCommentQuery} = generateAndCompile(`
			query FeedbackCommentQuery($id: ID) {
					node(id: $id) {
						...on Feedback {
							comments(first: 2)@connection(key: "FeedbackCommentQuery_comments") {
								edges {
									node {
                    body {
                      text
                    }
									}
								}
							}
						}
					}
				}
			`);
    const payload = {
      node: {
        __typename: 'Feedback',
        __id: feedbackId,
        comments: {
          edges: [
            {
              cursor: '<cursor>',
              node: {
                __id: firstCommentId,
                __typename: 'Comment',
                body: {
                  text: firstCommentBody,
                },
              },
            },
          ],
          page_info: {
            end_cursor: '<cursor>',
            has_next_page: true,
            has_previous_page: false,
            start_cursor: '<cursor>',
          },
        },
      },
    };
    const operationSelector = createOperationSelector(FeedbackCommentQuery, {
      id: feedbackId,
    });
    environment.commitPayload(operationSelector, payload);

    const {CommentCreateSubscription} = generateAndCompile(`
      subscription CommentCreateSubscription(
        $input: CommentCreateSubscriptionInput
      ) {
        commentCreateSubscribe(input: $input) {
          feedbackCommentEdge {
            node {
              body {
                text
              }
            }
          }
        }
      }
    `);

    const configs = [
      {
        type: 'RANGE_ADD',
        connectionName: 'comments',
        connectionInfo: [
          {
            key: 'FeedbackCommentQuery_comments',
            rangeBehavior: 'append',
          },
        ],
        parentID: feedbackId,
        edgeName: 'feedbackCommentEdge',
      },
    ];

    const secondCommentBody = 'second comment';
    requestRelaySubscription(environment, {
      configs,
      subscription: CommentCreateSubscription,
      variables: {
        feedbackId,
        text: secondCommentBody,
        clientSubscriptionId: '0',
      },
    });

    const subscriptionPayload = {
      data: {
        commentCreateSubscribe: {
          feedbackCommentEdge: {
            node: {
              __typename: 'Comment',
              __id: secondCommentId,
              body: {
                text: secondCommentBody,
              },
            },
          },
        },
      },
    };
    environment.mock.nextValue(CommentCreateSubscription, subscriptionPayload);
    const snapshot = store.lookup({
      dataID: ROOT_ID,
      node: FeedbackCommentQuery.fragment,
      variables: {id: feedbackId},
    });
    expect(snapshot.data).toEqual({
      node: {
        comments: {
          edges: [
            {
              cursor: '<cursor>',
              node: {
                __typename: 'Comment',
                body: {
                  text: firstCommentBody,
                },
                __id: firstCommentId,
              },
            },
            {
              cursor: undefined,
              node: {
                __typename: 'Comment',
                body: {
                  text: secondCommentBody,
                },
                __id: secondCommentId,
              },
            },
          ],
          pageInfo: {
            endCursor: null,
            hasNextPage: false,
          },
        },
        __id: 'foo',
      },
    });
  });
});
