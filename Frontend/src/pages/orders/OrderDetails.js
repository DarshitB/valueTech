import React, { useEffect, useLayoutEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchOrderById,
  fetchComments,
  addComment,
  updatePaymentStatus,
} from "../../redux/reducers/orderReducer";
import { getUsers } from "../../api/user.api";
import { MentionsInput, Mention } from "react-mentions";
import mentionsStyle from "./mentionsStyle";
import "./order.scss";
import {
  ApprovedIcon,
  ContactIcon,
  MoneyIcon,
  DocumentsIcon,
  EditIcon,
  FolderIcon,
  ImageCollageIcon,
  MailIcon,
  PaymentIcon,
  ReportIcon,
  RevalidateIcon,
  SelectedIcon,
  UploadImageIcon,
  UploadReportIcon,
  ValidateIcon,
  MailInputIcon,
} from "../../components/icons";
import { Link } from "react-router-dom";
import { usePageTitle } from "../../context/PageTitleContext";
import { hasPermission } from "../../utils/permissionUtils";
import { selectPermissions } from "../../redux/selectors/authSelectors";
import FormModel from "../../components/FormModel";
import { toast } from "react-toastify";

// Utility: Convert date to 'time ago' string
function timeAgo(dateString) {
  if (!dateString) return "-";
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return `${seconds} sec ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
}

// Import necessary libraries and components
// React hooks for state and lifecycle management
// useParams to access route parameters
// useDispatch and useSelector for Redux state management
// Import actions from orderReducer
// Import styles and icons
// Import Link for navigation and usePageTitle for setting the page title

// Utility function to convert a date string to a 'time ago' format

// Main component for displaying order details
function OrderDetails() {
  // Extract order ID from route parameters
  const { id } = useParams();
  // Initialize Redux dispatch function
  const dispatch = useDispatch();

  /* get logged user permission */
  const allowedPermissions = useSelector(selectPermissions);

  // Select order and comments data from Redux store
  const order = useSelector((state) => state.orders.selected);
  const comments = useSelector((state) => state.orders.comments);
  const paymentUpdating = useSelector((state) => state.orders.paymentUpdating);

  // Set page title using custom hook
  const { setTitle } = usePageTitle(); // set page title

  // Local state for managing comment input
  const [comment, setComment] = useState("");
  const [users, setUsers] = useState([]); // For mentions dropdown
  const [taggedUserIds, setTaggedUserIds] = useState([]); // For payload
  // Refs for managing scroll position in comments section
  const commentsEndRef = useRef(null);
  const commentsBoxRef = useRef(null);

  // Local state for managing payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [activeTab, setActiveTab] = useState("payment");
  const [showMailModal, setShowMailModal] = useState(false);

  // Form data state for payment details
  const [paymentFormData, setPaymentFormData] = useState({
    paymentAmount: "",
    paymentMode: "",
    paymentStatus: "",
  });

  // Form data state for billing details
  const [billingFormData, setBillingFormData] = useState({
    invoiceName: "",
    invoiceAmount: "",
  });

  // Form data state for mail details
  const [mailFormData, setMailFormData] = useState({
    to: "",
    cc: "",
    comments: "",
  });

  // Fetch order details and comments when component mounts or ID changes
  useEffect(() => {
    if (id) {
      dispatch(fetchOrderById(id));
      dispatch(fetchComments(id));
    }
  }, [dispatch, id]);

  // Fetch users for mentions
  useEffect(() => {
    getUsers().then((res) => {
      if (res.data && Array.isArray(res.data)) {
        setUsers(res.data.map((u) => ({ id: u.id, display: u.name })));
      }
    });
  }, []);

  // Filter out already-tagged users from the dropdown
  const getFilteredUsers = () =>
    users.filter((u) => !taggedUserIds.includes(u.id));

  // Handle mentions add/remove
  const handleMentionChange = (
    event,
    newValue,
    newPlainTextValue,
    mentions
  ) => {
    setComment(newValue);
    /* console.log("mentions", mentions); */
    setTaggedUserIds(mentions.map((m) => m.id));
  };

  // Scroll to the bottom of comments section when comments change
  useEffect(() => {
    if (commentsBoxRef.current) {
      commentsBoxRef.current.scrollTop = commentsBoxRef.current.scrollHeight;
    }
  }, [comments]);

  // Set page title with breadcrumb navigation
  useLayoutEffect(() => {
    setTitle(
      <>
        <Link to="/orders" className="text-blue-600 hover:underline">
          Orders
        </Link>{" "}
        &gt; {order && order.order_number ? order.order_number : "-"}
      </>
    );
  }, [id, order]);

  // Helper function to display a value or a dash if the value is null/undefined
  const showValue = (val) =>
    val === null || val === undefined || val === "" ? "-" : val;

  // Handle comment submission
  const handleCommentSubmit = (e) => {
    e.preventDefault();
    if (comment.trim()) {
      dispatch(
        addComment({
          id,
          data: {
            comment: comment.replace(/@\[(.*?)\]\(id:\d+\)/g, "@$1"), // store clean comment with only @name
            tagged_user_ids: taggedUserIds,
          },
        })
      ).then(() => {
        setComment("");
        setTaggedUserIds([]);
        dispatch(fetchComments(id));
      });
    }
  };

  // Helper to highlight tags in comment text
  const renderCommentWithTags = (commentObj) => {
    if (!commentObj.tags || commentObj.tags.length === 0)
      return commentObj.comment;
    let text = commentObj.comment;
    commentObj.tags.forEach((tag) => {
      // Replace @Name with a span
      const regex = new RegExp(`@${tag.name}`, "g");
      text = text.replace(
        regex,
        `<span class='mention-highlight'>@${tag.name}</span>`
      );
    });
    return <span dangerouslySetInnerHTML={{ __html: text }} />;
  };

  const OpenPaymentModal = () => {
    // Populate form with existing payment data if available
    setPaymentFormData({
      paymentAmount: order?.payment_amount
        ? order.payment_amount.toString()
        : "",
      paymentMode: order?.payment_mode || "",
      paymentStatus: order?.payment_status || "",
    });
    setShowPaymentModal(true);
  };

  const OpenMailModal = () => {
    setShowMailModal(true);
  };

  // Handle form input changes
  const handlePaymentFormChange = (e) => {
    const { name, value } = e.target;
    setPaymentFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle form submission
  const handlePaymentFormSubmit = () => {
    // Validation: Check if all required fields are filled
    if (
      !paymentFormData.paymentAmount ||
      !paymentFormData.paymentMode ||
      !paymentFormData.paymentStatus
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Check if data has changed by comparing with current order data
    const currentAmount = order?.payment_amount
      ? order.payment_amount.toString()
      : "";
    const currentMode = order?.payment_mode || "";
    const currentStatus = order?.payment_status || "";

    const hasChanged =
      paymentFormData.paymentAmount !== currentAmount ||
      paymentFormData.paymentMode !== currentMode ||
      paymentFormData.paymentStatus !== currentStatus;

    if (!hasChanged) {
      toast.info("No changes detected to update");
      return;
    }

    // Map form data to API payload format
    const payload = {
      payment_amount: parseFloat(paymentFormData.paymentAmount),
      payment_mode: paymentFormData.paymentMode,
      payment_status: paymentFormData.paymentStatus,
    };

    // Dispatch API call
    dispatch(updatePaymentStatus({ id, data: payload }))
      .unwrap()
      .then(() => {
        /* toast.success("Payment details updated successfully!"); */
        setShowPaymentModal(false);
        // No need to update anything - Redux will update the order data automatically
      })
      .catch((error) => {
        toast.error(`Failed to update payment: ${error}`);
      });
  };

  // Handle billing form input changes
  const handleBillingFormChange = (e) => {
    const { name, value } = e.target;
    setBillingFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle billing form submission
  const handleBillingFormSubmit = (e) => {
    e.preventDefault();
    console.log("Billing Form Data:", billingFormData);
    // Here you can add API call to save billing data
    // dispatch(saveBillingData({ orderId: id, billingData: billingFormData }));
    alert("Billing details saved successfully!");
    setShowPaymentModal(false);
    // Reset form data
    setBillingFormData({
      invoiceName: "",
      invoiceAmount: "",
    });
  };

  // Handle "Open In Tally" button
  const handleOpenInTally = (e) => {
    e.preventDefault();
    console.log("Opening in Tally with data:", billingFormData);
    // Here you can add logic to open Tally with the billing data
    alert("Opening in Tally...");
  };

  // Handle mail form input changes
  const handleMailFormChange = (e) => {
    const { name, value } = e.target;
    setMailFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Handle mail form submission
  const handleMailFormSubmit = (e) => {
    e.preventDefault();
    console.log("Mail Form Data:", mailFormData);
    // Here you can add API call to send mail
    // dispatch(sendMail({ orderId: id, mailData: mailFormData }));
    alert("Mail sent successfully!");
    setShowMailModal(false);
    // Reset form data
    setMailFormData({
      to: "",
      cc: "",
      comments: "",
    });
  };

  return (
    <section className="order-details-wrapper">
      {/* Layout for order details page */}
      <div className="row">
        {/* Sidebar with important order information */}
        <div className="col-xl-2 col-lg-3 col-md-3 col-sm-4 col-xs-12 p-md-0 mb-5 ">
          <div className="order-important-info">
            {/* Order number, status, and payment status */}
            <div className="order-impo-info-card">
              <p>Order Number</p>
              <h6>{showValue(order?.order_number)}</h6>
            </div>
            <div className="order-impo-info-card">
              <p>Order Status</p>
              <h6>{showValue(order?.current_status_name)}</h6>
            </div>
            <div className="order-impo-info-card">
              <p>Payment Status</p>
              <h6>{order?.payment_status ? order.payment_status : "-"}</h6>
            </div>
          </div>
        </div>
        {/* Main content area for order details */}
        <div className="col-xl-10 col-lg-9 col-md-9 col-sm-8 col-xs-12 mb-5">
          <div className="order-details-info">
            <div className="row h-100">
              {/* General information about the order */}
              <div className="col-xl-4 col-lg-6 col-md-6 col-sm-12 col-xs-12 border-right h-100 mb-lg-4 ">
                <div className="order-details-info-card">
                  <h6>General Information</h6>
                  <div className="order-details-info-sets">
                    {/* Category, asset category, subcategory, and registration number */}
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Category</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.category_name)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Asset category</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.sub_category_name)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Subcategory</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.child_category_name)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Registration No</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.registration_number)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Supervisor Number</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.supervisor_number)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Driver Number</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.driver_number)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Client information section */}
              <div className="col-xl-4 col-lg-6 col-md-6 col-sm-12 col-xs-12 border-right h-100 mb-lg-4 ">
                <div className="order-details-info-card client">
                  <h6>Client Information</h6>
                  <div className="order-details-info-sets">
                    {/* Client name and contact information */}
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Client Name</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.customer_name)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Contact Number</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.contact)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Alternative Contact Number</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.alternative_contact)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Place of Inspection</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.place_of_inspection)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Date of Inspection</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.date_of_inspection)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Office information section */}
              <div className="col-xl-4 col-lg-6 col-md-6 col-sm-12 col-xs-12">
                <div className="order-details-info-card office">
                  <h6>Office Information</h6>
                  <div className="order-details-info-sets">
                    {/* Bank, branch, officer, and inspection details */}
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Bank</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.bank_name)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Branch</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.branch_name)}</p>
                      </div>
                    </div>
                    <div className="order-details-info-set">
                      <div className="order-details-info-set-heading">
                        <p>
                          <span>Officer</span>
                          <span>:</span>
                        </p>
                      </div>
                      <div className="order-details-info-set-details">
                        <p>{showValue(order?.officer_name)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Recent activity section */}

        <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12 col-xs-12">
          <div className="recent-activity-wrapper">
            <div className="recent-activity-heading">
              {hasPermission(
                allowedPermissions,
                "view_order_recent_activity"
              ) && <h3>Recent Activity</h3>}
              <div className="recent-activity-buttons">
                {/* Action buttons for uploading images and reports, validating, etc. */}
                <Link title="Folder" className="tooltip-link">
                  <FolderIcon />
                </Link>
                <Link
                  to={`/orders/${id}/details/cv-report`}
                  title="CV Report"
                  className="tooltip-link"
                >
                  <ReportIcon />
                </Link>
                <Link
                  to={`/orders/${id}/details/avr-report`}
                  title="AVR Report"
                  className="tooltip-link"
                >
                  <ReportIcon />
                </Link>
                <Link
                  to={`/orders/${id}/details/machinery-report`}
                  title="Machinery Report"
                  className="tooltip-link"
                >
                  <ReportIcon />
                </Link>
                {/* <Link
                  to={`/orders/${id}/details/custom-report`}
                  title="Custom Report"
                  className="tooltip-link"
                >
                  <ReportIcon />
                </Link> */}
                {hasPermission(
                  allowedPermissions,
                  "view_order_media_files"
                ) && (
                  <Link
                    to={`/orders/${id}/details/images`}
                    title="Images"
                    className="tooltip-link"
                  >
                    <ImageCollageIcon />
                  </Link>
                )}
                {hasPermission(
                  allowedPermissions,
                  "view_order_media_documents"
                ) && (
                  <Link
                    to={`/orders/${id}/details/documents`}
                    title="Documents"
                    className="tooltip-link"
                  >
                    <DocumentsIcon />
                  </Link>
                )}
                <Link title="Approve" className="tooltip-link">
                  <ApprovedIcon />
                </Link>
                <Link title="Validate" className="tooltip-link">
                  <ValidateIcon />
                </Link>
                <Link
                  title="Payment"
                  className="tooltip-link"
                  onClick={OpenPaymentModal}
                >
                  <PaymentIcon />
                </Link>
                <Link
                  title="Mail"
                  className="tooltip-link"
                  onClick={OpenMailModal}
                >
                  <MailIcon />
                </Link>
              </div>
            </div>
            {hasPermission(
              allowedPermissions,
              "view_order_recent_activity"
            ) && (
              <div className="activities-wrapper">
                <div className="activities">
                  {order?.status_history && order.status_history.length > 0 ? (
                    order.status_history.map((status) => (
                      <div className="activity" key={status.id}>
                        <div className="activity-icon bg-primary text-white">
                          {status.changed_by_name
                            ?.split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </div>
                        <div className="activity-detail">
                          <p className="activity-time">
                            {timeAgo(status.changed_at)}
                          </p>
                          <p className="activity-description">
                            {status.status_name
                              ? showValue(status.status_name)
                              : showValue(status.activity_extra)}{" "}
                            by {showValue(status.changed_by_name)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div>No recent activity</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Comments section */}
        {hasPermission(allowedPermissions, "view_order_comments") && (
          <div className="col-xl-6 col-lg-6 col-md-12 col-sm-12 col-xs-12">
            <div className="order-comments-wrapper">
              <h3>Comments</h3>
              <div className="order-comments-box">
                <div
                  className="order-comments-show-comments"
                  ref={commentsBoxRef}
                >
                  <div className="order-comments-show-comments-inner">
                    {comments && comments.length > 0 ? (
                      comments.map((commentObj) => (
                        <div
                          className="order-comments-show-comments-card"
                          key={commentObj.id}
                        >
                          <div className="order-comments-show-comments-card-icon">
                            {commentObj.user_name
                              ?.split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </div>
                          <div className="order-comments-show-comments-card-content">
                            <p className="order-comments-show-comments-card-content-text">
                              <span className="name">
                                {showValue(commentObj.user_name)}
                              </span>
                              &nbsp;added a comment&nbsp;
                              <span>{timeAgo(commentObj.commented_at)}</span>
                            </p>
                            <p className="order-comments-show-comments-card-content-text-comment">
                              {renderCommentWithTags(commentObj)}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div>No comments</div>
                    )}
                    <div ref={commentsEndRef} />
                  </div>
                </div>
                {hasPermission(allowedPermissions, "add_order_comments") && (
                  <form
                    className="order-comments-add-comments"
                    onSubmit={handleCommentSubmit}
                  >
                    <MentionsInput
                      value={comment}
                      onChange={handleMentionChange}
                      className="mentions"
                      placeholder="type your comment here..."
                      allowSpaceInQuery
                      style={mentionsStyle}
                      singleLine
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleCommentSubmit(e);
                        }
                      }}
                    >
                      <Mention
                        trigger="@"
                        data={getFilteredUsers()}
                        displayTransform={(id, display) => `@${display}`}
                        appendSpaceOnAdd={true}
                        markup="@[__display__](id:__id__)"
                      />
                    </MentionsInput>
                    <button type="submit">
                      <EditIcon className="icon" />
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showPaymentModal && (
        <FormModel>
          {{
            title: " ",
            body: (
              <div
                className="payment-modal-content"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handlePaymentFormSubmit();
                  }
                }}
                tabIndex={-1}
              >
                {/* Bootstrap-style tab navigation */}
                <ul className="nav nav-tabs" role="tablist">
                  <li className="nav-item" role="presentation">
                    <button
                      className={`nav-link ${
                        activeTab === "payment" ? "active" : ""
                      }`}
                      onClick={() => setActiveTab("payment")}
                      type="button"
                      role="tab"
                    >
                      Payment Details
                    </button>
                  </li>
                  <li className="nav-item" role="presentation">
                    <button
                      className={`nav-link ${
                        activeTab === "billing" ? "active" : ""
                      }`}
                      onClick={() => setActiveTab("billing")}
                      type="button"
                      role="tab"
                    >
                      Billing Details
                    </button>
                  </li>
                </ul>

                {/* Tab content */}
                <div className="tab-content">
                  {activeTab === "payment" && (
                    <form
                      className="body-form-box tab-pane active"
                      role="tabpanel"
                      onSubmit={(e) => {
                        e.preventDefault(); // prevent full page reload
                        handlePaymentFormSubmit();
                      }}
                    >
                      <div className="body-form-box">
                        <div className="form-group">
                          <label>Payment Amount</label>
                          <div className="have-field-with-icon">
                            <div className="input-icon">
                              <MoneyIcon />
                            </div>
                            <input
                              type="text"
                              className="form-field"
                              id="paymentAmount"
                              name="paymentAmount"
                              value={paymentFormData.paymentAmount}
                              onChange={(e) => {
                                // Only allow numbers and decimal point
                                const value = e.target.value;
                                if (/^[0-9]*\.?[0-9]*$/.test(value)) {
                                  handlePaymentFormChange(e);
                                }
                              }}
                              placeholder="Enter amount"
                            />
                          </div>
                        </div>
                        <div className="form-group">
                          <label htmlFor="paymentMode">Payment Mode</label>
                          <div className="radio-group">
                            <label
                              className={`radio-label ${
                                paymentFormData.paymentMode === "NEFT"
                                  ? "selected"
                                  : ""
                              }`}
                            >
                              <input
                                type="radio"
                                value="NEFT"
                                name="paymentMode"
                                checked={paymentFormData.paymentMode === "NEFT"}
                                onChange={handlePaymentFormChange}
                              />
                              NEFT
                            </label>
                            <label
                              className={`radio-label ${
                                paymentFormData.paymentMode === "UPI"
                                  ? "selected"
                                  : ""
                              }`}
                            >
                              <input
                                type="radio"
                                value="UPI"
                                name="paymentMode"
                                checked={paymentFormData.paymentMode === "UPI"}
                                onChange={handlePaymentFormChange}
                              />
                              UPI
                            </label>
                          </div>
                        </div>
                        <div className="form-group">
                          <label htmlFor="paymentStatus">Payment Status</label>
                          <div className="radio-group">
                            <label
                              className={`radio-label ${
                                paymentFormData.paymentStatus === "Pending"
                                  ? "selected"
                                  : ""
                              }`}
                            >
                              <input
                                type="radio"
                                value="Pending"
                                name="paymentStatus"
                                checked={
                                  paymentFormData.paymentStatus === "Pending"
                                }
                                onChange={handlePaymentFormChange}
                              />
                              Pending
                            </label>
                            <label
                              className={`radio-label ${
                                paymentFormData.paymentStatus === "Received"
                                  ? "selected"
                                  : ""
                              }`}
                            >
                              <input
                                type="radio"
                                value="Received"
                                name="paymentStatus"
                                checked={
                                  paymentFormData.paymentStatus === "Received"
                                }
                                onChange={handlePaymentFormChange}
                              />
                              Received
                            </label>
                          </div>
                        </div>
                        <div className="form-buttons">
                          <button
                            type="submit"
                            className="submit-button"
                            disabled={paymentUpdating}
                          >
                            {paymentUpdating ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  {activeTab === "billing" && (
                    <form
                      className="body-form-box tab-pane active"
                      role="tabpanel"
                      onSubmit={handleBillingFormSubmit}
                    >
                      <div className="body-form-box">
                        <div className="form-group">
                          <label>Invoice Name</label>
                          <input
                            type="text"
                            className="form-field"
                            name="invoiceName"
                            value={billingFormData.invoiceName}
                            onChange={handleBillingFormChange}
                          />
                        </div>
                        <div className="form-group">
                          <label>Invoice Amount</label>
                          <div className="have-field-with-icon">
                            <div className="input-icon">
                              <MoneyIcon />
                            </div>
                            <input
                              type="text"
                              className="form-field"
                              name="invoiceAmount"
                              value={billingFormData.invoiceAmount}
                              onChange={handleBillingFormChange}
                              onKeyDown={(e) => {
                                // Allow: backspace, delete, tab, escape, enter, decimal point
                                if (
                                  [46, 8, 9, 27, 13, 110, 190].indexOf(
                                    e.keyCode
                                  ) !== -1 ||
                                  // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
                                  (e.keyCode === 65 && e.ctrlKey === true) ||
                                  (e.keyCode === 67 && e.ctrlKey === true) ||
                                  (e.keyCode === 86 && e.ctrlKey === true) ||
                                  (e.keyCode === 88 && e.ctrlKey === true) ||
                                  // Allow: home, end, left, right, down, up
                                  (e.keyCode >= 35 && e.keyCode <= 40)
                                ) {
                                  return;
                                }
                                // Ensure that it is a number and stop the keypress
                                if (
                                  (e.shiftKey ||
                                    e.keyCode < 48 ||
                                    e.keyCode > 57) &&
                                  (e.keyCode < 96 || e.keyCode > 105)
                                ) {
                                  e.preventDefault();
                                }
                              }}
                              placeholder="Enter amount"
                            />
                          </div>
                        </div>
                        <div className="form-buttons two">
                          <button type="submit" className="submit-button">
                            Save
                          </button>
                          <button
                            type="button"
                            className="submit-button open-tally"
                            onClick={handleOpenInTally}
                          >
                            Open In Tally
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            ),
            onClose: () => {
              setShowPaymentModal(false);
            },
          }}
        </FormModel>
      )}

      {showMailModal && (
        <FormModel>
          {{
            title: "Mail Documents",
            body: (
              <form className="body-form-box" onSubmit={handleMailFormSubmit}>
                <div className="body-form-box">
                  <div className="form-group">
                    <label htmlFor="to">To</label>
                    <div className="have-field-with-icon">
                      <div className="input-icon">
                        <MailInputIcon />
                      </div>
                      <input
                        type="email"
                        className="form-field"
                        id="to"
                        name="to"
                        value={mailFormData.to}
                        onChange={handleMailFormChange}
                        placeholder="vikas@gmail.com"
                        required
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="cc">CC</label>
                    <input
                      type="email"
                      className="form-field"
                      id="cc"
                      name="cc"
                      value={mailFormData.cc}
                      onChange={handleMailFormChange}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="comments">Comments</label>
                    <textarea
                      className="form-field"
                      id="comments"
                      name="comments"
                      value={mailFormData.comments}
                      onChange={handleMailFormChange}
                      rows="2"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="attachments">
                      Selected Collage & Report
                    </label>
                  </div>
                  <div className="form-buttons">
                    <button className="submit-button" type="submit">
                      Send Mail
                    </button>
                  </div>
                </div>
              </form>
            ),
            onClose: () => {
              setShowMailModal(false);
            },
          }}
        </FormModel>
      )}
    </section>
  );
}

export default OrderDetails;
